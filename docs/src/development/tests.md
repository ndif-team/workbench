# Testing Guide

The project includes a comprehensive test suite covering the widget, backend API, Python module, and end-to-end workflows.

## Quick Reference

```bash
./scripts/test.sh help      # Show all commands
./scripts/test.sh widget    # Widget unit tests (~8s)
./scripts/test.sh backend   # Backend API tests (~27s)
./scripts/test.sh notebook  # Python module tests (~9s)
./scripts/test.sh e2e       # End-to-end tests (~16s)
./scripts/test.sh all       # Run everything (~75s)
```

## Test Types

### Widget Tests (`widget`)

Tests the LogitLens JavaScript widget in isolation using Playwright.

**What's tested:**
- Widget initialization with V1 and V2 data formats
- Hover interactions and trajectory display
- Pin/unpin functionality
- Metric switching (probability vs rank mode)
- Dark mode rendering
- State serialization

**Requirements:** None - loads widget directly from filesystem

**Run:**
```bash
./scripts/test.sh widget
```

### Backend Tests (`backend`)

Python pytest tests for the FastAPI endpoints using local GPT-2.

**What's tested:**
- `/lens/start-v2` endpoint with various options
- `/lens/start-grid` for grid chart data
- `/lens/start-line` for line chart data
- Error handling and edge cases

**Requirements:** None - pytest loads the app directly

**Run:**
```bash
./scripts/test.sh backend

# Or directly with pytest
uv run pytest workbench/_api/tests/ -v
```

### Notebook Tests (`notebook`)

Tests for the `workbench.logitlens` Python module.

**What's tested:**
- Model architecture detection (GPT-2, Llama, Gemma, etc.)
- `collect_logit_lens()` data collection
- `to_js_format()` conversion
- `show_logit_lens()` HTML generation

**Requirements:** None

**Run:**
```bash
./scripts/test.sh notebook

# Or directly with pytest
uv run pytest workbench/logitlens/tests/ -v
```

### Integration Tests (`integration`)

React component tests with mocked backend API.

**What's tested:**
- Frontend rendering without real model inference
- API response handling
- Component interactions

**Requirements:** Frontend dev server running

**Run:**
```bash
# Start frontend first
cd workbench/_web && npm run dev &

# Run tests
./scripts/test.sh integration
```

### End-to-End Tests (`e2e`)

Full stack browser tests with real model inference.

**What's tested:**
- Complete user workflows
- Real GPT-2 inference through the stack
- Browser → Next.js → FastAPI → Model

**Requirements:** Frontend dev server (backend auto-started)

**Run:**
```bash
# Start frontend first
cd workbench/_web && npm run dev &

# Run tests (auto-starts backend)
./scripts/test.sh e2e
```

### Colab Tests (`colab`)

Live integration tests with Google Colab and NDIF.

**What's tested:**
- `collect_logit_lens(remote=True)` with real NDIF servers
- Widget rendering in Colab's sandboxed iframes
- Tutorial and smoke test notebooks end-to-end

**Requirements:** One-time Google auth setup, NDIF API key in Colab secrets

**Setup (one-time):**
```bash
# Opens browser to sign in to Google
./scripts/test.sh colab:setup
```

**Run:**
```bash
./scripts/test.sh colab           # Headless
./scripts/test.sh colab --headed  # With visible browser
```

## Test Locations

| Test Type | Location | Framework |
|-----------|----------|-----------|
| Widget | `workbench/_web/tests/logitlens.spec.ts` | Playwright |
| E2E | `workbench/_web/tests/e2e.spec.ts` | Playwright |
| Colab | `workbench/_web/tests/browser/colab-authenticated.spec.js` | Playwright |
| Backend | `workbench/_api/tests/` | pytest |
| Notebook | `workbench/logitlens/tests/` | pytest |

## Visual Regression

Widget and E2E tests include screenshot comparisons:

- `workbench/_web/tests/logitlens.spec.ts-snapshots/`
- `workbench/_web/tests/e2e.spec.ts-snapshots/`

To update after intentional visual changes:

```bash
cd workbench/_web
npx playwright test --update-snapshots
```

## Server Management

```bash
./scripts/test.sh start-servers  # Start frontend + backend
./scripts/test.sh stop-servers   # Stop test servers
```

## Running All Tests

```bash
# Start frontend
cd workbench/_web && npm run dev &

# Run full suite
./scripts/test.sh all
```

This runs widget, backend, notebook, integration, and e2e tests (~75 seconds total).

Note: Colab tests are not included in `all` due to external dependencies. Run them separately.
