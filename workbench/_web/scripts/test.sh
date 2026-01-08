#!/bin/bash
#
# Unified Test Runner for LogitLens Workbench
#
# Usage:
#   ./scripts/test.sh [command]
#
# Commands:
#   widget        Run widget unit tests (no server needed, ~8 sec)
#   integration   Run frontend integration tests (needs frontend)
#   e2e           Run end-to-end tests (auto-starts backend in local mode)
#   backend       Run backend pytest tests (auto-starts backend in local mode)
#   notebook      Run Python logitlens module tests (no server needed)
#   all           Run all tests (widget + backend + notebook + e2e)
#
#   colab:setup   One-time setup: log in to Google and save auth state
#   colab         Run Colab integration tests (semi-manual, not in 'all')
#
#   start-servers Start both frontend and backend for manual testing
#   stop-servers  Stop any running test servers
#
#   help          Show this help message
#
# Examples:
#   ./scripts/test.sh widget       # Quick widget tests, no servers
#   ./scripts/test.sh backend      # Backend API tests with GPT-2
#   ./scripts/test.sh notebook     # Python logitlens module tests
#   ./scripts/test.sh e2e          # Full stack browser tests
#   ./scripts/test.sh all          # Run everything
#   ./scripts/test.sh colab:setup  # One-time Google auth setup
#   ./scripts/test.sh colab        # Live Colab + NDIF integration tests
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(dirname "$SCRIPT_DIR")"
WORKBENCH_DIR="$(dirname "$WEB_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

# Check if a port is in use
port_in_use() {
    lsof -i ":$1" -t >/dev/null 2>&1
}

# Get process info for a port
get_port_process() {
    lsof -i ":$1" 2>/dev/null | grep LISTEN | head -1 | awk '{print $1 " (PID " $2 ")"}'
}

# Wait for a port to be available
wait_for_port() {
    local port=$1
    local timeout=${2:-30}
    local count=0
    while ! port_in_use "$port"; do
        sleep 1
        count=$((count + 1))
        if [ $count -ge $timeout ]; then
            return 1
        fi
    done
    return 0
}

# Kill process on a port with notification
kill_port() {
    local port=$1
    local name=$2
    if port_in_use "$port"; then
        local proc_info=$(get_port_process "$port")
        log_warn "Stopping existing $name on port $port: $proc_info"
        lsof -i ":$port" -t 2>/dev/null | xargs kill 2>/dev/null || true
        sleep 2
        if port_in_use "$port"; then
            log_warn "Force killing process on port $port..."
            lsof -i ":$port" -t 2>/dev/null | xargs kill -9 2>/dev/null || true
            sleep 1
        fi
    fi
}

# Check if backend is in local mode
check_backend_local_mode() {
    local response
    response=$(curl -s -X POST 'http://localhost:8000/lens/start-v2' \
        -H 'Content-Type: application/json' \
        -H 'X-User-Email: test@localhost' \
        -d '{"model": "openai-community/gpt2", "prompt": "test", "k": 1, "include_rank": false, "include_entropy": false}' 2>/dev/null)

    if echo "$response" | grep -q '"meta":\s*{' 2>/dev/null || echo "$response" | grep -q '"meta":{"version"' 2>/dev/null; then
        return 0  # Local mode (returns data directly)
    else
        return 1  # Remote mode (returns job_id)
    fi
}

# Start backend in local mode
start_backend() {
    local force=${1:-false}

    if port_in_use 8000; then
        if [ "$force" = true ]; then
            kill_port 8000 "backend"
        elif check_backend_local_mode; then
            log_success "Backend already running in local mode"
            return 0
        else
            log_warn "Backend running in remote mode, restarting in local mode..."
            kill_port 8000 "backend"
        fi
    fi

    log_info "Starting backend in local mode (this may take a moment to load GPT-2)..."
    cd "$WORKBENCH_DIR"
    REMOTE=false ENVIRONMENT=test uv run uvicorn workbench._api.main:app --port 8000 > /tmp/backend.log 2>&1 &
    BACKEND_PID=$!

    # Wait for backend to start (longer timeout for model loading)
    local timeout=120
    local count=0
    while ! port_in_use 8000; do
        sleep 1
        count=$((count + 1))
        if [ $count -ge $timeout ]; then
            log_error "Backend failed to start within $timeout seconds"
            cat /tmp/backend.log
            return 1
        fi
        if [ $((count % 10)) -eq 0 ]; then
            log_info "Still waiting for backend... (${count}s)"
        fi
    done

    # Wait for it to fully initialize and verify local mode
    sleep 3
    if check_backend_local_mode; then
        log_success "Backend started in local mode (PID: $BACKEND_PID)"
        return 0
    else
        log_error "Backend started but not in local mode!"
        cat /tmp/backend.log
        return 1
    fi
}

# Start frontend (Next.js dev server)
start_frontend() {
    if port_in_use 3000; then
        log_success "Frontend already running on port 3000"
        return 0
    fi

    log_info "Starting frontend (Next.js)..."
    cd "$WEB_DIR"
    npm run dev > /tmp/frontend.log 2>&1 &

    if wait_for_port 3000 60; then
        # Wait a bit more for Next.js to compile pages
        log_info "Waiting for Next.js to compile..."
        sleep 5
        log_success "Frontend started"
        return 0
    else
        log_error "Frontend failed to start"
        cat /tmp/frontend.log
        return 1
    fi
}

# Stop all test servers
stop_servers() {
    kill_port 8000 "backend"
    # Don't kill frontend by default as user likely wants it running
}

# ============================================
# Test Commands
# ============================================

# Run widget unit tests (no server needed)
run_widget_tests() {
    log_info "Running widget unit tests (no server needed)..."
    echo ""
    cd "$WEB_DIR"
    npx playwright test tests/logitlens.spec.ts \
        --grep-invert "Full App Integration" \
        --project=chromium \
        --reporter=list
    echo ""
    log_success "Widget unit tests completed (27 tests)"
}

# Run React integration tests (needs frontend, mocks backend)
run_integration_tests() {
    log_info "Running React integration tests (frontend + mocked backend)..."

    # Track if we started frontend (so we know to clean up)
    local we_started_frontend=false

    # Start frontend if not running
    if ! port_in_use 3000; then
        we_started_frontend=true
        start_frontend || exit 1
    fi

    echo ""
    cd "$WEB_DIR"
    local test_result=0
    npx playwright test tests/logitlens.spec.ts \
        --grep "React Integration Tests" \
        --project=chromium \
        --reporter=list || test_result=$?
    echo ""

    # Clean up frontend if we started it
    if [ "$we_started_frontend" = true ]; then
        log_info "Cleaning up: stopping frontend we started..."
        kill_port 3000 "frontend"
    fi

    if [ $test_result -eq 0 ]; then
        log_success "React integration tests completed (7 tests)"
    else
        log_error "React integration tests failed"
        return $test_result
    fi
}

# Run backend pytest tests
run_backend_tests() {
    log_info "Running backend pytest tests..."

    # Backend tests run with their own test client, no server needed
    # They set REMOTE=false internally via conftest.py
    echo ""
    cd "$WORKBENCH_DIR"
    uv run pytest _api/tests/ -v
    echo ""
    log_success "Backend tests completed"
}

# Run notebook/Python logitlens module tests
run_notebook_tests() {
    log_info "Running Python logitlens module tests..."
    echo ""
    cd "$WORKBENCH_DIR"
    uv run pytest logitlens/tests/ -v
    echo ""
    log_success "Python logitlens tests completed (33 tests)"
}

# Run E2E tests (needs both servers)
run_e2e_tests() {
    log_info "Running end-to-end tests..."

    # Track if we started servers (so we know to clean up)
    local we_started_frontend=false
    local we_started_backend=false

    # Start frontend if not running
    if ! port_in_use 3000; then
        we_started_frontend=true
        start_frontend || exit 1
    fi

    # Check if backend needs to be started or restarted
    if ! port_in_use 8000; then
        we_started_backend=true
    elif ! check_backend_local_mode; then
        we_started_backend=true  # We'll restart it
    fi

    # Ensure backend is running in local mode
    start_backend || exit 1

    # Run tests
    echo ""
    cd "$WEB_DIR"
    local test_result=0
    npx playwright test tests/e2e.spec.ts \
        --project=chromium \
        --reporter=list || test_result=$?
    echo ""

    # Clean up servers we started
    if [ "$we_started_backend" = true ]; then
        log_info "Cleaning up: stopping backend we started..."
        kill_port 8000 "backend"
    fi
    if [ "$we_started_frontend" = true ]; then
        log_info "Cleaning up: stopping frontend we started..."
        kill_port 3000 "frontend"
    fi

    if [ $test_result -eq 0 ]; then
        log_success "E2E tests completed (9 tests)"
    else
        log_error "E2E tests failed"
        return $test_result
    fi
}

# Run all tests
run_all_tests() {
    echo ""
    echo "========================================"
    echo "  Running All Tests"
    echo "========================================"
    echo ""

    local failed=0
    local we_started_frontend=false

    # Start frontend if not running (needed for integration and E2E tests)
    if ! port_in_use 3000; then
        we_started_frontend=true
        start_frontend || { log_error "Failed to start frontend"; exit 1; }
    fi

    # Widget tests (no server)
    run_widget_tests || failed=1
    echo ""

    # Backend pytest tests
    run_backend_tests || failed=1
    echo ""

    # Python logitlens module tests
    run_notebook_tests || failed=1
    echo ""

    # Integration tests (needs frontend)
    run_integration_tests || failed=1
    echo ""

    # E2E tests (needs frontend + backend)
    run_e2e_tests || failed=1

    # Clean up frontend if we started it
    if [ "$we_started_frontend" = true ]; then
        log_info "Cleaning up: stopping frontend we started..."
        kill_port 3000 "frontend"
    fi

    echo ""
    echo "========================================"
    if [ $failed -eq 0 ]; then
        log_success "All tests passed!"
    else
        log_error "Some tests failed"
        exit 1
    fi
}

# Start servers for manual testing
cmd_start_servers() {
    log_info "Starting test servers..."
    start_backend true  # force restart
    start_frontend
    echo ""
    log_success "Servers running:"
    echo "  - Backend:  http://localhost:8000 (local mode with GPT-2)"
    echo "  - Frontend: http://localhost:3000"
    echo ""
    log_info "Press Ctrl+C to stop, or run: ./scripts/test.sh stop-servers"
}

# Stop servers
cmd_stop_servers() {
    log_info "Stopping test servers..."
    kill_port 8000 "backend"
    log_success "Done"
}

# Run Colab auth setup (one-time)
run_colab_setup() {
    log_info "Running Google Colab authentication setup..."
    log_info "A Chrome browser will open. Please sign in to Google."
    echo ""
    cd "$WEB_DIR"
    npx playwright test tests/browser/colab-auth-setup.spec.js --headed --project=chromium --reporter=list
}

# Run Colab integration tests (auto-runs setup if needed)
run_colab_tests() {
    local AUTH_FILE="$WEB_DIR/.auth/google-state.json"
    local test_output
    local test_result

    # If no auth file exists, run setup first
    if [ ! -f "$AUTH_FILE" ]; then
        log_warn "No authentication state found. Running setup first..."
        echo ""
        run_colab_setup
        echo ""
        log_info "Setup complete. Now running Colab tests..."
        echo ""
    fi

    log_info "Running Colab integration tests..."
    log_info "This tests live NDIF + Colab integration (may take several minutes)"
    echo ""
    cd "$WEB_DIR"

    # Run tests and capture output + exit code
    test_output=$(mktemp)
    set +e
    npx playwright test tests/browser/colab-authenticated.spec.js --project=chromium --reporter=list "$@" 2>&1 | tee "$test_output"
    test_result=${PIPESTATUS[0]}
    set -e

    # Check if failure was due to auth expiration
    if [ $test_result -ne 0 ]; then
        if grep -q "authentication expired\|Re-run.*colab:setup\|Sign-in required" "$test_output"; then
            log_warn "Authentication expired. Re-running setup..."
            rm -f "$test_output"
            echo ""
            run_colab_setup
            echo ""
            log_info "Setup complete. Retrying Colab tests..."
            echo ""

            # Retry the tests
            npx playwright test tests/browser/colab-authenticated.spec.js --project=chromium --reporter=list "$@"
            test_result=$?
        else
            rm -f "$test_output"
            return $test_result
        fi
    fi

    rm -f "$test_output"
    echo ""
    if [ $test_result -eq 0 ]; then
        log_success "Colab tests completed"
    fi
    return $test_result
}

# Show help
show_help() {
    head -32 "$0" | tail -30
}

# Main
case "${1:-help}" in
    widget)
        run_widget_tests
        ;;
    integration)
        run_integration_tests
        ;;
    backend)
        run_backend_tests
        ;;
    notebook)
        run_notebook_tests
        ;;
    e2e)
        run_e2e_tests
        ;;
    all)
        run_all_tests
        ;;
    start-servers)
        cmd_start_servers
        ;;
    stop-servers)
        cmd_stop_servers
        ;;
    colab:setup)
        run_colab_setup
        ;;
    colab)
        shift
        run_colab_tests "$@"
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        log_error "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
