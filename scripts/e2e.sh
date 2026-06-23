#!/bin/bash
#
# End-to-end Playwright test runner — automates the full local sequence from
# .docs/e2e-tests-explained.html. Builds the app in its e2e configuration
# (local SQLite, auth disabled), starts the real FastAPI backend on :8000 wired
# to real NDIF, waits for it to be ready, then runs Playwright (which boots the
# frontend on :3000 itself via its webServer block).
#
# Usage (from the repo root):
#   ./scripts/e2e.sh                      # whole suite
#   ./scripts/e2e.sh logit-lens.spec.ts   # one file
#   ./scripts/e2e.sh -g "higher Top-K"    # one test by title
#   ./scripts/e2e.sh --headed             # extra args pass through to playwright
#
# Secrets: real-NDIF specs need NDIF_API_KEY (and HF_TOKEN). The script picks
# them up from the environment or the repo-root .env. Without NDIF_API_KEY the
# backend can't auth to NDIF and the real-NDIF specs will fail (see the doc).

set -uo pipefail

# --- locate repo root (this script lives in <root>/scripts) -------------------
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# --- find bun (mirrors scripts/test.sh) ---------------------------------------
if command -v bun &> /dev/null; then
    BUN="bun"
elif [ -x "$HOME/.bun/bin/bun" ]; then
    BUN="$HOME/.bun/bin/bun"
else
    echo "Error: bun not found. Install it: https://bun.sh" >&2
    exit 1
fi
command -v uv &> /dev/null || { echo "Error: uv not found. Install it: https://docs.astral.sh/uv/" >&2; exit 1; }

# --- pull secrets from repo-root .env if present (without clobbering env) ------
# Only HF_TOKEN / NDIF_API_KEY are read; everything else is set explicitly below.
if [ -f .env ]; then
    [ -z "${HF_TOKEN:-}" ]      && HF_TOKEN="$(sed -n 's/^HF_TOKEN=//p' .env | tail -1)"
    [ -z "${NDIF_API_KEY:-}" ]  && NDIF_API_KEY="$(sed -n 's/^NDIF_API_KEY=//p' .env | tail -1)"
fi
HF_TOKEN="${HF_TOKEN:-}"
NDIF_API_KEY="${NDIF_API_KEY:-}"

if [ -z "$NDIF_API_KEY" ]; then
    echo "⚠️  NDIF_API_KEY is not set — the backend can't authenticate to NDIF, so the"
    echo "    real-NDIF specs (logit-lens, activation-patching, notebook-export) will fail."
    echo "    Set it first:  export NDIF_API_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    echo "    Continuing anyway (the non-NDIF smoke test can still run)…"
    echo
fi

# --- e2e configuration (exported so Next bakes NEXT_PUBLIC_* at build time, and
#     uvicorn inherits CONFIG/secrets — no .env files are overwritten) ----------
export NEXT_PUBLIC_LOCAL_DB=true
export NEXT_PUBLIC_DISABLE_AUTH=true
export NEXT_PUBLIC_BASE_URL=http://localhost:3000
export NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
export LOCAL_SQLITE_URL=./e2e.db
export CONFIG=e2e
export REMOTE=true
export HF_TOKEN NDIF_API_KEY

LOG_DIR="$(mktemp -d)"
API_LOG="$LOG_DIR/api.log"
API_PID=""

cleanup() {
    [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null
    rm -f "$ROOT/workbench/_web/e2e.db"
}
trap cleanup EXIT INT TERM

# --- 1. native modules --------------------------------------------------------
# better-sqlite3 is a native addon; `bun install` doesn't always produce a
# binary matching the Node that runs drizzle-kit / `next build`, so the binding
# can be missing entirely. Rebuild it for Node when absent (mirrors the CI
# "Rebuild native modules for Node" step). One-time per install.
if [ ! -f workbench/_web/node_modules/better-sqlite3/build/Release/better_sqlite3.node ]; then
    command -v npm &> /dev/null || { echo "Error: npm not found (needed to build better-sqlite3)" >&2; exit 1; }
    echo "▶ Building better-sqlite3 native addon for Node…"
    ( cd workbench/_web && npm rebuild better-sqlite3 > "$LOG_DIR/rebuild.log" 2>&1 ) \
        || { echo "Error: 'npm rebuild better-sqlite3' failed. Log:" >&2; tail -40 "$LOG_DIR/rebuild.log" >&2; exit 1; }
fi

# --- 2. database --------------------------------------------------------------
echo "▶ Creating e2e SQLite database…"
rm -f workbench/_web/e2e.db
( cd workbench/_web && $BUN x drizzle-kit push --force > /dev/null ) \
    || { echo "Error: drizzle-kit push failed" >&2; exit 1; }

# --- 3. build the frontend (e2e env baked in) ---------------------------------
# NOTE: don't run this while a `next dev` server for THIS worktree is up — both
# write to .next and will corrupt each other.
echo "▶ Building the frontend (this can take a minute)…"
( cd workbench/_web && $BUN run build > "$LOG_DIR/build.log" 2>&1 ) \
    || { echo "Error: build failed. Tail of build log:" >&2; tail -40 "$LOG_DIR/build.log" >&2; exit 1; }

# --- 4. start the real-NDIF backend on :8000 ----------------------------------
echo "▶ Starting backend on :8000 (real NDIF, CONFIG=e2e)…"
uv run uvicorn workbench._api.main:app --host 0.0.0.0 --port 8000 --log-level info \
    > "$API_LOG" 2>&1 &
API_PID=$!

# --- 5. wait for /models/ to return a non-empty array -------------------------
echo "▶ Waiting for the backend to be ready (NDIF's first call is slow)…"
ready=""
for _ in $(seq 1 60); do
    if ! kill -0 "$API_PID" 2>/dev/null; then
        echo "Error: backend process exited during startup. Log:" >&2
        tail -60 "$API_LOG" >&2
        exit 1
    fi
    body="$(curl -sf http://localhost:8000/models/ -m 30 2>/dev/null || true)"
    if [ -n "$body" ] && echo "$body" | jq -e 'type == "array" and length > 0' > /dev/null 2>&1; then
        echo "  backend ready ($(echo "$body" | jq 'length') model(s))"
        ready=1
        break
    fi
    sleep 2
done
if [ -z "$ready" ]; then
    echo "Error: backend failed to come up. Log:" >&2
    tail -80 "$API_LOG" >&2
    exit 1
fi

# --- 6. run Playwright (it boots the frontend on :3000 via its webServer) ------
echo "▶ Running Playwright tests…"
( cd workbench/_web && $BUN x playwright test "$@" )
status=$?

echo
if [ "$status" -eq 0 ]; then
    echo "✅ Playwright tests passed."
else
    echo "❌ Playwright tests failed (exit $status). Backend log: $API_LOG"
    echo "   HTML report: workbench/_web/playwright-report/ (bunx playwright show-report)"
fi
exit "$status"
