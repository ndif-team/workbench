# Workbench Local Development Setup

## Prerequisites

- [uv](https://docs.astral.sh/uv/) — Python package manager
- [bun](https://bun.sh/) — JavaScript runtime
- Python 3.12
- Git

## 1. Clone the repositories

```bash
# Clone the workbench
git clone https://github.com/<org>/workbench.git
cd workbench

# Clone nnsightful (visualization + interpretability tools) alongside workbench
cd ..
git clone https://github.com/AdamBelfki3/nnsightful.git
```

Your directory structure should look like:

```
work/
├── workbench/
└── nnsightful/
```

## 2. Python environment

```bash
cd workbench
uv venv
source .venv/bin/activate
uv sync --extra dev
```

## 3. Environment variables

### Root .env

```bash
cp .env.template .env
```

Edit `.env` with your values. Key settings for local development:

```env
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_DISABLE_AUTH=true
NEXT_PUBLIC_LOCAL_DB=true
LOCAL_SQLITE_URL=./local.db
```

### Backend .env

```bash
cp workbench/_api/.env.template workbench/_api/.env
```

Edit `workbench/_api/.env`:

```env
NDIF_API_KEY=<your NDIF API key>
HF_TOKEN=<your HuggingFace token>
CONFIG=dev
REMOTE=false
```

## 4. Build nnsightful

The frontend depends on nnsightful for visualization components. Build it first:

```bash
cd ../nnsightful
npm install
npm run build
cd ../workbench
```

## 5. Install frontend dependencies

```bash
cd workbench/_web
bun install
```

This runs the `postinstall` script which creates a symlink from `node_modules/nnsightful` to the nnsightful clone.

Verify the symlink resolves:

```bash
ls node_modules/nnsightful/dist/index.mjs
```

If it doesn't resolve, the relative path in the postinstall script may need adjusting for your directory layout.

## 6. Set up the database

Using local SQLite (recommended for development):

```bash
cd workbench/_web
bunx drizzle-kit generate
bunx drizzle-kit push
```

## 7. Start the application

Open two terminals:

### Terminal 1 — Backend (FastAPI)

```bash
cd workbench
bash ./scripts/api.sh
```

Or manually:

```bash
cd workbench
uvicorn _api.main:app --host 0.0.0.0 --port 8000 --reload
```

### Terminal 2 — Frontend (Next.js)

```bash
cd workbench
bash ./scripts/web.sh
```

Or manually:

```bash
cd workbench/_web
bun run dev
```

The app will be available at **http://localhost:3000**.

## Project Structure

```
workbench/
├── workbench/
│   ├── _web/                   # Next.js frontend (port 3000)
│   │   ├── src/
│   │   │   ├── app/            # Pages and routes
│   │   │   ├── components/     # React components
│   │   │   ├── db/             # Database client and schemas
│   │   │   └── types/          # TypeScript types
│   │   ├── scripts/            # Utility scripts
│   │   └── package.json
│   ├── _api/                   # FastAPI backend (port 8000)
│   │   ├── routes/             # API endpoints
│   │   ├── _model_configs/     # Model TOML configs (dev, local, prod)
│   │   └── main.py             # App entry point
├── scripts/
│   ├── web.sh                  # Start frontend
│   └── api.sh                  # Start backend
├── pyproject.toml              # Python dependencies
├── .env.template               # Environment variable template
└── SETUP.md                    # This file
```

## Common Tasks

### Changing model configuration

Model configs live in `workbench/_api/_model_configs/`. Set the `CONFIG` env variable to choose which one to load (`dev`, `local`, or `prod`). The default is `dev`.

### Code quality

```bash
cd workbench/_web
bun run lint           # ESLint
bun run format         # Prettier auto-format
bun run format:check   # Check formatting
bun test               # Run tests
```

### Modifying visualizations

When editing visualization code in the nnsightful repo, you need to rebuild for changes to take effect:

```bash
cd ../nnsightful
npm run build
```

Or use watch mode for continuous rebuilding:

```bash
npm run build:watch
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Can't resolve 'nnsightful'` | Run `bun install` in `_web/` to recreate the symlink, and make sure nnsightful is built |
| `Invalid symlink` from Turbopack | Verify `turbopack.root` in `next.config.js` points high enough to cover the nnsightful directory |
| SQLite locked | Close other database connections |
| CORS errors | Check `NEXT_PUBLIC_BACKEND_URL` matches the actual backend address |
| Model loading fails | Verify `HF_TOKEN` is set for gated models |
| Port already in use | Kill processes on ports 3000/8000: `lsof -ti:3000 | xargs kill` |
