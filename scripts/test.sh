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
        echo "  db          - Run database tests only"
        echo "  (no argument) - Run all tests"
        exit 1
        ;;
esac
