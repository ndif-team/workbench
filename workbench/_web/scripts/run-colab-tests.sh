#!/bin/bash
#
# Run Google Colab integration tests
#
# This script runs Playwright tests against Google Colab.
# Before running, you must complete a one-time setup.
#

set -e
cd "$(dirname "$0")/.."

AUTH_FILE=".auth/google-state.json"

print_setup_instructions() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════════════╗"
    echo "║              COLAB TEST SETUP INSTRUCTIONS                         ║"
    echo "╠════════════════════════════════════════════════════════════════════╣"
    echo "║                                                                    ║"
    echo "║  STEP 1: Google Authentication                                     ║"
    echo "║  ─────────────────────────────────────────────────────────────────║"
    echo "║  Run this command (opens a browser window):                        ║"
    echo "║                                                                    ║"
    echo "║    ./scripts/test.sh colab:setup                                   ║"
    echo "║                                                                    ║"
    echo "║  Then sign in to Google when prompted. The script will save       ║"
    echo "║  your auth state for future test runs.                            ║"
    echo "║                                                                    ║"
    echo "║  STEP 2: Add NDIF_API to Colab Secrets                            ║"
    echo "║  ─────────────────────────────────────────────────────────────────║"
    echo "║  1. Go to: https://colab.research.google.com                      ║"
    echo "║  2. Click the key icon 🔑 in the left sidebar                     ║"
    echo "║  3. Click 'Add a secret'                                          ║"
    echo "║  4. Name: NDIF_API                                                ║"
    echo "║     Value: (your API key from https://nnsight.net)                ║"
    echo "║  5. Toggle 'Notebook access' ON                                   ║"
    echo "║                                                                    ║"
    echo "║  Also add HF_TOKEN for gated models (Llama):                      ║"
    echo "║  4. Name: HF_TOKEN                                                ║"
    echo "║     Value: (your token from https://huggingface.co/settings/tokens)║"
    echo "║                                                                    ║"
    echo "║  STEP 3: Run Tests                                                ║"
    echo "║  ─────────────────────────────────────────────────────────────────║"
    echo "║  Re-run this script:                                              ║"
    echo "║                                                                    ║"
    echo "║    ./scripts/test.sh colab                                        ║"
    echo "║                                                                    ║"
    echo "╚════════════════════════════════════════════════════════════════════╝"
    echo ""
}

# Check for auth state
if [ ! -f "$AUTH_FILE" ]; then
    echo ""
    echo "❌ Authentication state not found!"
    echo ""
    echo "You need to complete the one-time setup before running Colab tests."
    print_setup_instructions
    exit 1
fi

# Auth exists - run tests
echo ""
echo "✅ Found authentication state: $AUTH_FILE"
echo ""
echo "Running Colab integration tests..."
echo "─────────────────────────────────────────────────────"
echo ""

# Run the authenticated tests
npx playwright test tests/browser/colab-authenticated.spec.js "$@"

echo ""
echo "─────────────────────────────────────────────────────"
echo "Tests complete!"
echo ""
echo "Note: If tests fail with auth errors, re-run:"
echo "  ./scripts/test.sh colab:setup"
echo ""
