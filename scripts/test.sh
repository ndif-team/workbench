#!/bin/bash
#
# Unified Test Runner - thin wrapper
#
# This script delegates to workbench/_web/scripts/test.sh which contains
# the full test orchestration logic. Run from repo root:
#
#   ./scripts/test.sh help      # Show all commands
#   ./scripts/test.sh all       # Run all tests
#   ./scripts/test.sh widget    # Run widget tests only
#
# See workbench/_web/README.md for detailed documentation.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

exec "$REPO_ROOT/workbench/_web/scripts/test.sh" "$@"
