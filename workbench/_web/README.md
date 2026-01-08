# LogitLens Workbench Frontend

Next.js frontend for the LogitLens visualization workbench.

**See also:** [Widget JavaScript API](src/lib/logit-lens-widget/API.md) for embedding the widget in your own pages.

## Development

```bash
npm install
npm run dev
```

## Testing

The test suite includes multiple levels of testing, from fast unit tests to full end-to-end tests.

### Quick Start

```bash
# Run all tests (requires frontend running: npm run dev)
./scripts/test.sh all

# Run just the fast widget tests (no server needed)
./scripts/test.sh widget
```

### Test Commands

| Command | Tests | Time | Requirements |
|---------|-------|------|--------------|
| `./scripts/test.sh widget` | 27 | ~8s | None |
| `./scripts/test.sh integration` | 7 | ~13s | Frontend server |
| `./scripts/test.sh backend` | 9 | ~27s | None (uses pytest) |
| `./scripts/test.sh notebook` | 33 | ~9s | None (uses pytest) |
| `./scripts/test.sh e2e` | 9 | ~16s | Frontend server |
| `./scripts/test.sh all` | 85 | ~75s | Frontend server |
| `./scripts/test.sh colab` | 3 | ~1-2m | Google auth + NDIF API |

### Test Types

#### Widget Unit Tests (`widget`)
- Tests the LogitLens widget JavaScript in isolation
- Loads widget directly from filesystem (no HTTP server)
- Covers: initialization, hover, pin, display modes, state serialization
- **No servers required** - fastest tests

#### React Integration Tests (`integration`)
- Tests React components with mocked backend API
- Verifies frontend renders correctly without real model inference
- Mocks `/models/`, `/lens/start-v2`, `/lens/start-grid`, `/lens/start-line`
- **Requires:** Frontend dev server (`npm run dev`)

#### Backend API Tests (`backend`)
- Tests Python FastAPI endpoints using pytest
- Uses GPT-2 model for real inference (loaded via test client)
- Covers: V2 lens, grid, line endpoints with various options
- **No running server needed** - pytest loads app directly

#### Python Module Tests (`notebook`)
- Tests the `workbench.logitlens` Python module
- Unit tests for model detection, format conversion, HTML generation
- Integration tests with GPT-2 for `collect_logit_lens` function
- Tests the notebook-style API: `from workbench import collect_logit_lens, show_logit_lens`
- **No running server needed** - uses pytest with nnsight directly

#### End-to-End Tests (`e2e`)
- Full stack tests: Browser → Next.js → FastAPI → GPT-2
- Tests real model inference with actual API calls
- Auto-starts backend in local mode with `ENVIRONMENT=test`
- Auto-cleans up backend after tests complete
- **Requires:** Frontend dev server (`npm run dev`)

#### Colab Integration Tests (`colab`)
- Tests notebooks running on Google Colab with live NDIF
- Verifies `collect_logit_lens(remote=True)` works with real NDIF servers
- Tests widget rendering in Colab's sandboxed iframes
- Runs `smoke_test.ipynb` and `tutorial.ipynb` end-to-end
- **Requires:** One-time Google auth setup, NDIF_API secret in Colab
- **Not included in `all`** - runs separately due to external dependencies

### Running Tests

```bash
# Widget tests - no setup needed
./scripts/test.sh widget

# Integration tests - start frontend first
npm run dev &
./scripts/test.sh integration

# Backend tests - no setup needed
./scripts/test.sh backend

# Python module tests - no setup needed
./scripts/test.sh notebook

# E2E tests - start frontend, script handles backend
npm run dev &
./scripts/test.sh e2e

# All tests
npm run dev &
./scripts/test.sh all

# Colab tests (one-time setup required)
./scripts/test.sh colab:setup    # Opens browser to log in to Google
./scripts/test.sh colab          # Run Colab tests (headless)
./scripts/test.sh colab --headed # Run with browser visible
```

### Colab Test Setup

The Colab tests require:

1. **Google authentication** (one-time):
   ```bash
   ./scripts/test.sh colab:setup
   ```
   This opens a browser where you sign in to Google. Auth state is saved to `.auth/google-state.json`.

2. **NDIF API key in Colab secrets**:
   - Open any Colab notebook
   - Click the key icon in the left sidebar
   - Add a secret named `NDIF_API` with your key from [nnsight.net](https://nnsight.net)
   - Enable "Notebook access" for the secret

The tests will auto-retry setup if auth expires.

### Server Management

```bash
# Start both servers for manual testing
./scripts/test.sh start-servers

# Stop test servers
./scripts/test.sh stop-servers
```

### Test Files

- `tests/logitlens.spec.ts` - Widget unit tests + React integration tests
- `tests/e2e.spec.ts` - End-to-end tests with real backend
- `tests/browser/colab-authenticated.spec.js` - Colab + NDIF integration tests
- `tests/browser/colab-auth-setup.spec.js` - Google auth setup helper
- `tests/fixtures/` - Test data fixtures
- `../_api/tests/` - Backend pytest tests
- `../logitlens/tests/` - Python module pytest tests

### Visual Regression

Widget and E2E tests include visual regression screenshots:
- `tests/logitlens.spec.ts-snapshots/` - Widget screenshots
- `tests/e2e.spec.ts-snapshots/` - E2E screenshots

To update snapshots after intentional visual changes:
```bash
npx playwright test --update-snapshots
```

## Project Structure

```
_web/
├── src/
│   ├── app/                    # Next.js app router pages
│   ├── components/             # React components
│   └── lib/
│       └── logit-lens-widget/  # Widget source (TypeScript)
├── public/
│   ├── logit-lens-widget.js    # Built widget
│   └── logit-lens-widget.min.js
├── tests/
│   ├── logitlens.spec.ts       # Widget + integration tests
│   ├── e2e.spec.ts             # End-to-end tests
│   └── fixtures/               # Test data
└── scripts/
    └── test.sh                 # Unified test runner
```
