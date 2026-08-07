#!/bin/bash

# Test runner script for workbench
# Usage:
#   ./scripts/test.sh       - Run all tests
#   ./scripts/test.sh db    - Run database tests only

# Find bun - check common locations
if command -v bun &> /dev/null; then
    BUN="bun"
elif [ -x "$HOME/.bun/bin/bun" ]; then
    BUN="$HOME/.bun/bin/bun"
else
    echo "Error: bun not found. Please install bun: https://bun.sh"
    exit 1
fi

cd workbench/_web

# Set up test environment
export NEXT_PUBLIC_LOCAL_DB=true
export NEXT_PUBLIC_DISABLE_AUTH=true
export LOCAL_SQLITE_URL=.test.db

# Clean up any existing test database and push schema
rm -f .test.db
echo "Creating test database schema..."
PUSH_OUTPUT=$($BUN x drizzle-kit push --force 2>&1)
PUSH_STATUS=$?
# drizzle-kit prints a failure to load its sqlite driver and still exits 0, so
# check that the schema actually landed rather than trusting the exit code —
# otherwise the run continues and every DB test fails with "no such table".
if [ $PUSH_STATUS -ne 0 ] || [ ! -s .test.db ]; then
    echo "Error: Failed to push database schema"
    # The tests themselves use bun:sqlite, but drizzle-kit runs under node and
    # needs better-sqlite3's native binding. Bun skips install scripts unless the
    # package is trusted, so a fresh `bun install` leaves it unbuilt and every DB
    # test then fails with "no such table".
    if echo "$PUSH_OUTPUT" | grep -qi "better_sqlite3\|bindings file"; then
        cat <<'HINT'

better-sqlite3's native binding is missing. Build it once with:

    (cd workbench/_web/node_modules/better-sqlite3 && ../.bin/prebuild-install)

Don't add better-sqlite3 to trustedDependencies to fix this — the deploy image
has no node-gyp, so its install script fails there and the image won't build.
HINT
    else
        echo "$PUSH_OUTPUT" | tail -20
    fi
    exit 1
fi

case "$1" in
    db)
        echo "Running database tests..."
        $BUN test src/db
        ;;
    "")
        echo "Running all tests..."
        $BUN test
        ;;
    *)
        echo "Usage: $0 [db]"
        echo ""
        echo "Options:"
        echo "  db            - Run database tests only"
        echo "  (no argument) - Run all tests"
        exit 1
        ;;
esac

# Clean up test database
rm -f .test.db
