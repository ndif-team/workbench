---
name: update-nnsight-deps
description: Refresh nnsight (PyPI) and/or nnsightful (git) to their latest versions and update uv.lock and bun.lock. Use whenever the user asks to bump nnsight or nnsightful.
---

Two packages, distinct flows:

- **nnsight** — PyPI, Python only. Constrained in `pyproject.toml` (currently `nnsight>=0.6.3`).
- **nnsightful** — git default-branch HEAD, used in **both** `pyproject.toml` (`nnsightful @ git+https://...`) and `workbench/_web/package.json` (`"nnsightful": "github:AdamBelfki3/nnsightful"`). Both lockfiles must be refreshed together.

All commands run from the repo root unless noted.

## Args

- `nnsight` → step 1 only
- `nnsightful` → step 2 only
- no arg / `both` → step 1 then step 2

## 1. nnsight (PyPI)

Refresh the lockfile to the latest version that satisfies the existing floor in `pyproject.toml`:

```bash
uv lock --upgrade-package nnsight
uv sync
```

If the user wants to *raise* the floor (e.g. require a new major version):

```bash
uv add 'nnsight>=<NEW_VERSION>'   # edits pyproject.toml + relocks
uv sync
```

## 2. nnsightful (git, both languages)

Refresh both lockfiles to the latest commit on `main`:

```bash
# Python lock
uv lock --upgrade-package nnsightful

# TS lock (must run inside _web)
cd workbench/_web
bun update nnsightful
cd -

# Apply Python changes to the active venv
uv sync
```

If `bun update nnsightful` doesn't change `bun.lock`, the install cache is holding a stale commit. Force a clean fetch:

```bash
rm -rf workbench/_web/node_modules/nnsightful
cd workbench/_web && bun install && cd -
```

## Verify

Confirm what landed and check for type drift:

```bash
# nnsight version in uv.lock
grep -A 1 '^name = "nnsight"' uv.lock | head

# nnsightful resolved revision in uv.lock
grep -B 1 -A 4 '"nnsightful"' uv.lock | head -20

# nnsightful resolved revision in bun.lock
grep -A 2 'nnsightful' workbench/_web/bun.lock | head

# Frontend types — catches API drift from a bumped nnsightful commit
cd workbench/_web && bunx tsc --noEmit
```

Report back to the user:
- Old vs new nnsight version (semver), and/or
- Old vs new nnsightful commit SHA (short, ~7 chars).

## Caveats

- **Do not run `next build` / `bun run build`** while the user's dev server is up — it corrupts `.next/`. `bunx tsc --noEmit` is the safe verifier.
- Most likely **break sites** after a nnsightful bump:
  - Backend: `workbench/_api/routes/logit_lens.py`, `workbench/_api/routes/activation_patching.py` (import nnsightful tools).
  - Frontend: `workbench/_web/src/app/workbench/[workspaceId]/lens2/[chartId]/components/Lens2Display.tsx` and `.../activation-patching/[chartId]/components/ActivationPatchingDisplay.tsx` (consume nnsightful types/widgets).
  - Notebook export: `workbench/_web/src/actions/notebook.ts` reads `node_modules/nnsightful/src/nnsightful/viz/charts.js` — if nnsightful restructures `viz/`, this path needs updating here AND in `next.config.js` `outputFileTracingIncludes`.
- If the dev server is up, exercise lens2 and activation-patching pages in the browser after a nnsightful bump.

## Commit suggestion

Do not commit unless asked. If the user asks, single commits per bump:

```
chore(deps): bump nnsight to <version>
chore(deps): bump nnsightful to <short-sha>
chore(deps): bump nnsight + nnsightful
```
