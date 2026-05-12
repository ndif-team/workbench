# CLAUDE.md — workbench

Practical guidance for coding agents working in this repo. Specific to this codebase, not generic advice.

If you're proposing visual UI changes, also follow `.claude/skills/product-native-frontend-design/SKILL.md` — it captures the bar this app is held to.

---

## 1. Project Overview

**Workbench** is an interactive web UI for AI interpretability research. Researchers open a workspace, load an open-source LLM, and run interpretability "tools" (logit lens, activation patching) against it. Results are visualized as charts and saved per-workspace.

**Top-level concepts**
- **Workspace** — the unit of saved work. Owned by one user. Holds charts and documents (research notes).
- **Model** — an open-source LLM that the active backend can host (e.g. `meta-llama/Llama-3.2-1B`). Selected per-workspace via `useWorkspace.selectedModelIdx`.
- **Chart** — a single experiment + its visualization (currently: lens2 / activation-patching / lens v1 hidden). One chart row = one config row = one display.
- **Config** — the parameters that produced the chart (prompt, topk, etc.). Stored as `jsonb` in the `configs` table.
- **Document** — a Lexical-based research note inside a workspace.
- **Generation panel** (recent addition) — right-rail playground for prompting the active model with arbitrary text and viewing raw completions; per-(workspace, model) history.

**High-level architecture**
```
[Next.js frontend  :3000] ──HTTP──► [FastAPI backend  :8000] ──nnsight──► [NDIF remote] OR [local model]
       │                                  │
       │                              telemetry → InfluxDB
       │
       ├─server actions──► [Postgres (Supabase) OR local SQLite] via Drizzle
       └─auth via Supabase SSR cookies
```
The backend speaks `nnsight` to either NDIF (remote model deployments) or local weights; it's stateless from the frontend's POV — all persistence is on the frontend's DB layer. Long-running model jobs return a `job_id` that the frontend polls.

---

## 2. Tech Stack

| Layer | What |
|---|---|
| Framework | Next.js 15.5.9 App Router, React 18.3.1, Turbopack dev |
| Runtime | Bun for install + tests; Node for `next dev` |
| Language | TypeScript (strict but `ignoreBuildErrors: true` in `next.config.js`) |
| Design system | shadcn/ui (style `new-york`, base `zinc`), Tailwind 3.4.17, Radix primitives, Lucide icons, Motion (`framer-motion`/`motion`) |
| State | zustand 5 (UI/ephemeral), `@tanstack/react-query` 5 (server data) |
| Forms / inputs | Lexical for the document editor; CodeMirror for code blocks |
| Charts | Nivo (`@nivo/heatmap`, `@nivo/line`), nnsightful widgets (LogitLensWidget, ActivationPatchingWidget) |
| Database | Drizzle ORM 0.44 with **two backends** chosen at runtime by `NEXT_PUBLIC_LOCAL_DB`: <br>• Postgres via `postgres-js` (Supabase) <br>• SQLite via `better-sqlite3` (local dev) or `bun:sqlite` (under bun test) |
| Auth | Supabase SSR (`@supabase/ssr`); short-circuited to a stub user when `NEXT_PUBLIC_DISABLE_AUTH=true` |
| Backend | FastAPI on Python 3.12, nnsight 0.6 + nnterp + transformers, deployed via Docker / Modal |
| Telemetry | InfluxDB client; PostHog on the frontend |
| Toasts | `sonner` |
| Testing | `bun:test` for DB tests; Playwright for e2e (`tests/`); k6 for load tests (`tests/k6/`) |

---

## 3. Repository Structure

Repo root: `/home/localadam/work/workbench-dev/workbench/` (or wherever you cloned it). Two cohabiting trees:
- `workbench/_api/` — FastAPI backend
- `workbench/_web/` — Next.js frontend

```
workbench/                          # repo root
├── pyproject.toml                  # Python deps (FastAPI, nnsight, nnsightful)
├── Makefile                        # docker/modal/k6 commands
├── scripts/
│   ├── api.sh                      # `uvicorn _api.main:app --host 0.0.0.0 --port 8000 --reload`
│   ├── web.sh                      # `bun install; bun run dev`  (`--local` flag symlinks nnsightful)
│   ├── docker.sh / modal.sh / test.sh
├── docker/                         # Dockerfiles for the API
├── modal/                          # Modal deployment config
│
├── workbench/_api/                 # Python backend
│   ├── main.py                     # FastAPI app + CORS + router mounts
│   ├── auth.py                     # X-User-Email header → user identity
│   ├── state.py                    # AppState: model registry, NDIF backend factory, model metadata
│   ├── data_models.py              # NDIFResponse, Token shared types
│   ├── telemetry.py                # InfluxDB telemetry client
│   ├── _model_configs/             # per-deploy model lists (TOML)
│   └── routes/
│       ├── __init__.py             # registers nnsightful with NDIF (`ndif.register(nnsightful)`)
│       ├── models.py               # /models  (list, /start-prediction, /start-generate, ...)
│       ├── lens.py                 # /lens    (legacy lens v1)
│       ├── logit_lens.py           # /logit_lens  (lens2 — uses nnsightful.tools.logit_lens)
│       ├── activation_patching.py  # /activation_patching (uses nnsightful.tools.activation_patching)
│       └── patch.py                # /patch (legacy)
│
└── workbench/_web/                 # Next.js frontend
    ├── package.json
    ├── next.config.js              # transpiles "nnsightful"; turbopack root expanded for symlink
    ├── tailwind.config.ts          # tokens (radius, primary, etc.) — see globals.css
    ├── drizzle.config.ts           # picks pg or sqlite by NEXT_PUBLIC_LOCAL_DB
    ├── components.json             # shadcn config
    ├── eslint.config.mjs
    ├── playwright.config.ts
    ├── pg-migrations/              # drizzle-generated, may not be committed
    ├── sqlite-migrations/          # drizzle-generated, may not be committed
    ├── scripts/copy-env.js         # copies repo-root .env → _web/.env (runs in `dev` script)
    ├── tests/                      # Playwright + k6
    └── src/
        ├── app/                    # Next App Router
        │   ├── layout.tsx          # Theme + Query + Tour + PostHog providers; Toaster
        │   ├── page.tsx            # landing → redirects to /workbench
        │   ├── login/
        │   ├── auth/callback/
        │   ├── api/                # Next route handlers (patch-grid, tokens/query)
        │   └── workbench/
        │       ├── page.tsx        # workspace list
        │       ├── components/     # WorkspaceList, ModelsDisplay, LogoutButton
        │       └── [workspaceId]/
        │           ├── layout.tsx  # workspace header (back, title, status, theme, GitHub)
        │           ├── page.tsx    # opens or creates the most recent chart
        │           ├── components/                  # workspace-scoped UI
        │           │   ├── ChartCardsSidebar.tsx, ChartCard.tsx
        │           │   ├── MobileSidebarDrawer.tsx, MobileCollapsibleControls.tsx
        │           │   └── generation/              # right-rail Text Generation panel
        │           ├── lens2/[chartId]/             # logit-lens chart (nnsightful widget)
        │           ├── activation-patching/[chartId]/
        │           ├── overview/[overviewId]/       # Lexical editor
        │           └── [chartId]/                   # legacy lens v1 (hidden, do not extend)
        │
        ├── components/             # app-wide composed components
        │   ├── ui/                 # shadcn primitives (Button, Card, Switch, Popover, ...)
        │   ├── charts/             # ChartDisplay, ViewProvider, line/heatmap renderers
        │   ├── activation-patching/, transformer/
        │   ├── providers/          # CaptureProvider, QueryProvider, ThemeProvider, TourProvider
        │   ├── magicui/            # animated extras (border-beam, etc.)
        │   ├── ModelSelector.tsx   # workspace-wide model picker
        │   ├── LandingPage.tsx, WorkspaceNameEditor.tsx, NotebookExporter.tsx
        │   └── ...
        │
        ├── stores/                 # zustand stores
        │   ├── useWorkspace.ts     # selectedModelIdx, jobStatus
        │   ├── useLensWorkspace.ts # lens line highlighting (UI only)
        │   └── useGenerationPanel.ts (rail history)
        │
        ├── hooks/                  # useIsMobile, useIsDark, useLensCharts, useTutorialManager
        │
        ├── lib/
        │   ├── config.ts           # backendUrl + ndifUrl + endpoint paths
        │   ├── startAndPoll.ts     # NDIF job orchestration
        │   ├── utils.ts            # cn(), hslFromCssVar()
        │   ├── queryKeys.ts        # all React Query keys
        │   ├── api/                # CLIENT-side API wrappers (use*Mutation hooks)
        │   ├── queries/            # SERVER actions ("use server")
        │   ├── data/tutorial/      # tutorial chart fixtures
        │   ├── exportTemplates/    # non-notebook export blobs
        │   ├── supabase/           # client.ts, server.ts, middleware.ts
        │   └── posthog-server.ts
        │
        ├── actions/                # SERVER actions used as RPCs from the client
        │   ├── auth.ts             # createUserHeadersAction → { "X-User-Email": ... }
        │   ├── notebook.ts         # builds .ipynb from chart data + nnsightful viz
        │   ├── tok.ts, tokenize.ts # tokenizer + decode utilities
        │   └── errors.ts
        │
        ├── db/
        │   ├── schema.pg.ts        # Postgres tables (jsonb, uuid, timestamp)
        │   ├── schema.sqlite.ts    # SQLite mirror (text json, integer timestamp)
        │   ├── schema.ts           # picks one based on NEXT_PUBLIC_LOCAL_DB; exports types
        │   ├── client.ts           # `db` instance — pg via postgres-js OR sqlite via better-sqlite3 / bun:sqlite
        │   └── __tests__/          # bun:test integration tests against .test.db
        │
        ├── types/                  # shared TS types (charts, lens, lens2, patching, models, ...)
        ├── notebook-templates/     # .ipynb skeletons that NotebookExporter fills
        └── middleware.ts           # next middleware → updateSession (Supabase cookie refresh)
```

---

## 4. Frontend Architecture Guidelines

### Container vs presenter

Every non-trivial feature has **one container** (knows about URL params, stores, calls server actions/APIs) and **N presentational children** (props in, JSX out). Examples to follow:
- `app/workbench/[workspaceId]/components/generation/GenerationRail.tsx` is the container; `GenerationItem`, `GenerationTimeline`, `GenerationComposer`, `GenerationParamsPopover` are presentational.
- `app/workbench/[workspaceId]/lens2/[chartId]/components/Lens2Area.tsx` reads route params + workspace store; `Lens2Controls.tsx` and `Lens2Display.tsx` are downstream.

### Where to put new files

| Component shape | Location |
|---|---|
| Generic primitive, no app types in props | `src/components/ui/` (`Button`, `Switch`, `Tooltip`, …) |
| App-wide composed, used in many unrelated places | `src/components/` (`ModelSelector`, `WorkbenchStatus`, `UserDropdown`) |
| Decoupled from URL/state but **takes app domain types** in props (e.g. `GenerationItem` typed prop) | feature folder co-located with its route → `app/<route>/components/<feature>/` |
| Reads URL params or stores or calls APIs | same feature folder, marked as the container |

**Default to feature-local.** Promote to `src/components/` only when a second real consumer appears. Premature abstraction is a quality regression.

### Reusing `components/ui`

Always reach for the existing primitive first. The catalog: `badge, button, card, checkbox, dialog, double-slider, dropdown-menu, input, label, mode-toggle, popover, resizable, scroll-area, select, separator, slider, sonner, switch, textarea, tooltip`. Don't fork them for cosmetic tweaks — pass `className` and merge with `cn()` from `lib/utils`.

If a primitive is missing (e.g. a Sheet), prefer adding a thin wrapper around the existing Radix package (already a dep) over hand-rolling.

### Styling rules (this app's actual tokens)

Defined in `src/app/globals.css`:
- `--radius: 0.375rem` — use `rounded-md` (≈radius), `rounded` (≈radius+1px); avoid `rounded-xl`/`rounded-lg` mixed with these.
- `--font-sans: Inter`, `--font-mono: JetBrains Mono`, `--font-serif: Source Serif 4`.
- `--primary: 217 91% 60%` (a blue) — used for the most important CTA and active/selected state.
- Shadow ramp: `--shadow-xs … --shadow-2xl`. Default cards use `shadow-xs` or `shadow-sm`.
- Sidebar surfaces use `bg-secondary/80` (light) and `bg-secondary/50` (dark), bordered, with `rounded`.

**Hard rules**:
- `font-mono` ONLY on content the user reads as data: code, prompts, outputs, tabular numbers. Never UI chrome.
- No tracked-uppercase tiny labels (`text-[10px] uppercase tracking-…`) — the rest of the app uses sentence-case `text-sm font-medium`.
- No arbitrary `text-[Npx]`. Use Tailwind's standard scale (`text-xs`, `text-sm`).
- One radius token per feature.

Existing panel header pattern (copy this exactly when adding a new panel):
```tsx
<div className="p-3 border-b flex items-center justify-between">
  <h2 className="text-sm pl-2 font-medium">Title</h2>
  <div className="flex items-center gap-2">…controls…</div>
</div>
```
See `Lens2Area.tsx`, `ActivationPatchingArea.tsx`, `GenerationRail.tsx`.

### Avoiding off-brand / AI-looking UI

Refuse on sight: ✨ Sparkles icons, `> ` terminal glyphs, dotted-grid backgrounds, hand-rolled switches/toggles, multiple concurrent loading indicators, "Streaming" labels on polling APIs, marketing-style hero copy on internal tools, `backdrop-blur-sm` on opaque surfaces, hidden-until-hover actions on touch surfaces. See the `product-native-frontend-design` skill for the full list.

---

## 5. State Management Guidelines

Pick the lightest location that does the job:

| Use | Where | Examples |
|---|---|---|
| UI-only, ephemeral | `useState` | composer focus, draft text, hover |
| Survives reload, shareable | URL search params | initial prompt/model from landing page (`/workbench/[id]?prompt=…&model=…`) |
| Server data | React Query | charts, configs, documents, models list, generations |
| Cross-page UI | zustand | `useWorkspace` (selected model, job status), `useLensWorkspace` (highlights), `useGenerationPanel` (drafts/collapse/optimistic pendings) |
| Survives reload, no server | localStorage via zustand `persist` | `workbench_sidebar_collapsed`, `workbench:generation-panel` |
| Many descendants need read | React Context | `ViewProvider` (`components/charts/ViewProvider.tsx`) — rare |

**zustand is for ephemeral UI state, not durable history.** Long-term history belongs in the DB. Today the generation panel partially violates this (it persists history to localStorage); a planned migration moves history to the DB and trims the store to: composer drafts, panel `collapsed`, optimistic pending items.

**Bucket persisted state by the natural composite key.** `useGenerationPanel` keys by `${workspaceId}::${modelName}`. If you add similar features, follow the pattern.

**On rehydrate, clean up impossible states.** See `useGenerationPanel.ts onRehydrateStorage` — pending items left over from a closed tab become `error`.

**Don't mirror server state into local state.** Server data goes through `useQuery`. If you need to mutate it optimistically, use `setQueryData` in `onMutate`.

---

## 6. Data Persistence Guidelines

### The dual-DB setup

`drizzle.config.ts` selects the schema and dialect by `NEXT_PUBLIC_LOCAL_DB`:
- `true` → `src/db/schema.sqlite.ts` + `sqlite-migrations/`
- (unset) → `src/db/schema.pg.ts` + `pg-migrations/` + Supabase `DATABASE_URL`

`src/db/schema.ts` re-exports the right tables and `db/client.ts` instantiates the right client.

**You write each schema twice.** Mirror the table definitions across `schema.pg.ts` and `schema.sqlite.ts`. Equivalences:
- `uuid("id").primaryKey().defaultRandom()` ↔ `text("id").primaryKey().$defaultFn(generateUUID)`
- `jsonb("data").$type<T>()` ↔ `text("data", { mode: "json" })`
- `timestamp("created_at", { mode: "date" }).defaultNow()` ↔ `integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date())`
- `varchar("name", { length: 256 })` ↔ `text("name")`
- `references(() => parent.id, { onDelete: "cascade" })` — only added in pg; sqlite tables use plain columns (matches existing convention).

### Migrations

```bash
cd workbench/_web
bunx drizzle-kit generate     # produces migration files
bunx drizzle-kit push         # applies them to the active DB
```

Migration folders are `pg-migrations/` and `sqlite-migrations/`, generated locally; check the convention before assuming they're committed.

### Existing patterns for new entities

Look at `charts` / `configs` for the canonical shape:
- One row per entity; flexible payload in a `jsonb`/`json` column typed via `$type<T>()`.
- `userId` is stamped on `workspaces` only; child tables cascade through `workspaceId` FK.
- Auth is enforced in the server action body (e.g. `getWorkspaces(userId)`), not by the DB.

### Server vs client query layers

Two distinct files for each entity:
- `src/lib/queries/<entity>Queries.ts` — `"use server"` directive; calls `db` directly. Server-only; safe to use Supabase auth and secrets here.
- `src/lib/api/<entity>Api.ts` — client-side React Query wrappers (`useQuery`, `useMutation`). Calls server actions or external HTTP (FastAPI / NDIF).

Keep them split. Server actions are RPCs invoked from client mutations.

### Generation history (specific guidance)

The current implementation stores history in zustand+localStorage. The plan to durabilize it (when implemented):
- **One row per generation item.** Schema should look like `charts`/`configs`: id, workspaceId (FK cascade), model, status, prompt, output, error, params (JSON), metadata (JSON), timestamps.
- **Pending state stays in zustand only** unless a job is long enough that cross-tab visibility matters. For two-write flow (insert pending → update on completion), see the architecture proposal in chat history.
- **Successful and failed rows go to Supabase / SQLite** via the standard pattern.
- **Use JSON columns** for `params` and `metadata` — the user-facing shape evolves; promoting frequently-queried fields out is fine, but don't try to schematize every sampling knob.
- **Storage buckets are not for normal text outputs.** The prompt/output text columns are big enough. Reserve Supabase Storage (if used) for binary artifacts only.

---

## 7. API / Query Patterns

### Backend HTTP layer

Frontend ↔ FastAPI:
- `src/lib/config.ts` lists every endpoint path. **Add new routes here**, don't hardcode.
- `src/lib/startAndPoll.ts` is the NDIF job runner: POST start → poll `ndif.us/response/{job_id}` until COMPLETED → POST results. Updates `useWorkspace.jobStatus` ("QUEUED: 3", "Idle", etc.) so the header status pill reflects state.
- All FastAPI calls include the `X-User-Email` header. Build it via `createUserHeadersAction()` from `src/actions/auth.ts`.

### Mutation conventions (see `src/lib/api/lensApi.ts`, `chartApi.ts`)

```ts
const fn = async (req): Promise<T> => {
  const headers = await createUserHeadersAction();
  return await startAndPoll<T>(start, req, results, headers);
};

export const useFoo = () =>
  useMutation({
    mutationFn: fn,
    onMutate: ...,    // optimistic
    onError: () => toast.error("..."),
    onSuccess: () => queryClient.invalidateQueries(...),
  });
```

**Where errors are surfaced**: shared mutations toast via `sonner` in `onError`. If a feature renders its own inline error UI (like the generation rail), **export the bare async function** alongside the mutation hook so the feature can call it without the toast — see `generateCompletion` in `src/lib/api/modelsApi.ts`. Don't fork the mutation.

### Query keys

Centralized in `src/lib/queryKeys.ts`. Add new entries there:
```ts
queryKeys.charts.chart(chartId)
queryKeys.charts.sidebar(workspaceId)
queryKeys.documents.byWorkspace(workspaceId)
```

### React Query defaults

Set in `src/components/providers/QueryProvider.tsx`: `staleTime: 5min`, `retry: 1`. Treat that as the baseline; override per-query when needed.

---

## 8. UI / Design System Rules

### Existing primitives to prefer

`src/components/ui/`: Button, Card, Checkbox, Dialog, DoubleSlider, DropdownMenu, Input, Label, ModeToggle, Popover, Resizable, ScrollArea, Select, Separator, Slider, Sonner, Switch, Textarea, Tooltip.

### Layout patterns the app uses

- **Workspace shell** = `ChartCardsSidebar` (left, `w-64`, collapsible via `workbench_sidebar_collapsed` localStorage key) + a `ResizablePanelGroup` of feature panels. Examples: `lens2/[chartId]/page.tsx`, `activation-patching/[chartId]/page.tsx`.
- **Feature panel** = bordered, rounded card (`rounded dark:bg-secondary/50 bg-secondary/80 border`) with the standard panel header pattern (see §4).
- **Mobile** = `MobileSidebarDrawer` (FAB bottom-left), `MobileCollapsibleControls` (collapsible top section), `MobileGenerationDrawer` (FAB bottom-right). Mirror these when adding mobile paths.
- **Charts** = `ChartDisplay` orchestrates Nivo or nnsightful widgets via `ViewProvider`.
- **Modals/dialogs** = used sparingly, only for blocking confirmations or single-step entry.
- **Right-rail / inspector** = the generation panel; collapses via a slim sash (`CollapsedRailButton`).

### Rules for new surfaces

- **Panels/rails**: copy the existing header pattern exactly. Provide a collapse mechanism if the app has any other collapsible neighbor.
- **Modals**: only for blocking, focused tasks. Confirmations use Popover with destructive Button if the action is contained.
- **Cards**: use the `Card` primitive or match its shape. One radius.
- **Forms**: vertical, grouped via `Label` + input. Use `Switch`/`Checkbox`/`Slider` from `components/ui`.
- **Dashboards / data views**: use `Card` for tiles; tabular nums for any number column; persistent low-contrast row actions (not hover-only on touch).

### Accessibility expectations

- Every interactive element keyboard-reachable.
- Focus rings come from primitives — don't custom-style.
- All inputs labelled (`<Label>` or `aria-label`).
- Loading regions use `aria-live="polite"` (see `GenerationItem`).
- Confirm destructive actions in a Popover/Dialog; never single-click.
- Multi-line composers: submit on `⌘/Ctrl-Enter` and reserve plain Enter for newlines.
- Action buttons stay visible at low contrast (e.g. `text-muted-foreground/40`) instead of hidden-until-hover.

---

## 9. Development Commands

All from the repo root unless noted.

### Setup

```bash
# Python
uv venv && source .venv/bin/activate
uv sync --extra dev

# nnsightful (must be cloned alongside `workbench`, see §10)
cd ../nnsightful && npm install && npm run build && cd -

# Frontend
cd workbench/_web && bun install
```

`.env` lives at the repo root and is mirrored into `workbench/_web/.env` by `scripts/copy-env.js` (runs automatically in the dev script).

### Running locally

```bash
# Terminal 1 (backend)
bash ./scripts/api.sh        # uvicorn _api.main:app --reload --port 8000

# Terminal 2 (frontend)
bash ./scripts/web.sh        # bun install && bun run dev (port 3000)
bash ./scripts/web.sh --local  # also symlinks node_modules/nnsightful → ../../../../nnsightful
```

### Frontend gates (run from `workbench/_web/`)

```bash
bun run lint                 # eslint .
bun run format / format:check
bun run knip                 # unused exports / files
bunx tsc --noEmit            # typecheck
bun run test                 # bun:test (DB integration tests in src/db/__tests__)
bun run dev                  # next dev -p 3000 --turbopack
bun run build                # next build  ← see warning below
```

### Database

```bash
cd workbench/_web
bunx drizzle-kit generate    # generate migrations from schema diff
bunx drizzle-kit push        # apply against the active DB
```

### Docker / Modal

```bash
make build                   # docker build -t workbench:latest -f docker/Dockerfile .
make up / make down / make logs
make modal                   # modal deploy modal/image.py
```

### Load testing

```bash
make lens-local              # k6 against http://localhost:8000
make lens-modal              # k6 against the deployed modal app
```

### ⚠️ Warnings

- **Do NOT run `next build` while the user's `next dev` is running.** Both write to `.next/`; the build clobbers manifest tempfiles, leaving the dev server with `ENOENT _buildManifest.js.tmp.*` and 500s on server actions. Verify with `bunx tsc --noEmit` and `bun run lint` instead. Recovery if it happens: stop the dev server, `rm -rf .next`, restart.
- **Auth disabled mode** (`NEXT_PUBLIC_DISABLE_AUTH=true`) returns a stub user (`dev@localhost`) from `src/lib/supabase/server.ts`; useful for local dev without Supabase.
- **TS errors in build are silenced** (`ignoreBuildErrors: true` in `next.config.js`). Always run `tsc --noEmit` separately to catch them.

---

## 10. External Dependency: nnsightful

`nnsightful` is a sibling library used by **both** the Python backend and the TypeScript frontend. It is **not on PyPI/npm registries** — it lives in a separate git repo (`AdamBelfki3/nnsightful`) and is consumed two ways:

### What it provides

`nnsightful` is the **interpretability tooling layer** the workbench is built on. It owns:
- **Tools** — Python implementations of the actual interpretability experiments (`logit_lens`, `activation_patching`). Each tool has a `_run(...)` (executes against an nnsight model) and a `to_data_obj(...)` (shapes the result into a typed payload).
- **Type schemas** — Pydantic + TypeScript types describing tool inputs/outputs (`LogitLensData`, `ActivationPatchingData`, `LogitLensUIState`, `ActivationPatchingMode`).
- **React widgets** — `LogitLensWidget`, `ActivationPatchingWidget` that render those data objects.
- **Standalone visualization JS** — `viz/charts.js` for offline notebook rendering.

The contract between workbench and nnsightful is: **workbench wires tools to UI; nnsightful owns the experiments and the visualizations.**

### Where it's installed

- **Python**: declared in `pyproject.toml` as a git source: `nnsightful @ git+https://github.com/AdamBelfki3/nnsightful.git`. Installed by `uv sync`.
- **TypeScript**: declared in `workbench/_web/package.json` as `"nnsightful": "github:AdamBelfki3/nnsightful"`. For local development, `scripts/web.sh --local` replaces the install with a symlink to a sibling clone (`../../nnsightful` from `_web/`). The user's expected layout:
  ```
  work/
  ├── workbench/
  └── nnsightful/
  ```
- `next.config.js` has `transpilePackages: ["nnsightful"]` and a Turbopack `root` set to the parent dir so the symlink resolves during dev.

### Where it's used in the codebase

**Backend** (`workbench/_api/`):
- `routes/__init__.py` registers nnsightful with NDIF: `from nnsight import ndif; import nnsightful; ndif.register(nnsightful)` — this lets NDIF's remote backend serialize+execute nnsightful tools.
- `routes/logit_lens.py` imports `from nnsightful.types import LogitLensData` and `from nnsightful.tools.logit_lens import logit_lens`. The `/logit_lens/start` and `/logit_lens/results/{job_id}` endpoints call `logit_lens._run(...)` and shape via `logit_lens.to_data_obj(...)`.
- `routes/activation_patching.py` mirrors the same pattern for activation patching.

**Frontend** (`workbench/_web/src/`):
- `app/workbench/[workspaceId]/lens2/[chartId]/components/Lens2Display.tsx` — `import { LogitLensWidget } from "nnsightful"; import type { LogitLensData } from "nnsightful";` and renders the widget directly with `chart.data`.
- `app/workbench/[workspaceId]/activation-patching/[chartId]/components/ActivationPatchingDisplay.tsx` — same with `ActivationPatchingWidget`, `ActivationPatchingMode`.
- `types/lens2.ts` re-exports `LogitLensData`, `LogitLensUIState` from nnsightful as `Lens2Data` / `Lens2UIState` so workbench-internal code talks in the workbench-native names.
- `actions/notebook.ts` reads `node_modules/nnsightful/src/nnsightful/viz/charts.js` and inlines it into exported `.ipynb` files; the HTML embedding mirrors `nnsightful.viz._widget_html()` defaults (`DEFAULT_WIDTH = "90%"`, per-tool aspect ratios).
- `notebook-templates/activation-patching.ipynb` instructs users to `pip install git+https://github.com/AdamBelfki3/nnsightful.git` and `from nnsightful import activation_patching`.

### Workbench's wrappers around nnsightful

- **Backend**: each tool route is a thin FastAPI shim around `tool._run(...)` and `tool.to_data_obj(...)`. The wrapper handles auth (`require_user_email`), state injection (`Depends(get_state)`), telemetry, NDIF job-id flow, and the `NDIFResponse` envelope (in `workbench/_api/data_models.py`):
  ```ts
  // shape returned to frontend
  { job_id?: string; data?: T }
  ```
  When `state.remote=True`, `_run` returns a `job_id` and the workbench responds `{job_id}`; the frontend then polls and finally hits `/results/{job_id}` which calls `to_data_obj(...)` on the materialized backend result.
- **Frontend**: `lib/startAndPoll.ts` is the polling state machine that turns the two-step start→results NDIF flow into a single `Promise<T>`. `lib/api/*.ts` wraps `startAndPoll` per tool. Components consume the resulting `data` directly via the nnsightful widget.

### Assumptions the UI makes about nnsightful responses

1. **Two-step async, not streaming.** Tools return either a `data` payload immediately (local mode, `state.remote=False`) or a `job_id` that takes ~seconds to minutes to complete on NDIF. Today the workbench polls; **streaming is not currently supported** — don't add a "streaming" label/UI without changing the underlying flow.
2. **Result shape is dictated by `to_data_obj(...)`.** `LogitLensData` and `ActivationPatchingData` are the contract. Don't hand-massage these in workbench code; if the shape needs to change, it changes in nnsightful first and workbench updates its imports.
3. **Errors are NDIF-shaped.** The poll loop in `startAndPoll.ts` recognizes `ERROR` and `NNSIGHT_ERROR` statuses from the NDIF response endpoint and throws — error UX flows from there (toast + inline). Errors from tool internals surface as job failures, not HTTP 500s.
4. **Widgets are self-contained.** `LogitLensWidget` and `ActivationPatchingWidget` render their full UI given `data` and a small UI-state prop. Workbench supplies theme via `next-themes` (`useTheme().resolvedTheme`) and lets the widget handle internal interactions.
5. **viz/charts.js path is stable.** `actions/notebook.ts` reads `node_modules/nnsightful/src/nnsightful/viz/charts.js` directly. If nnsightful restructures its viz folder, this path needs updating in `notebook.ts` AND in `next.config.js`'s `outputFileTracingIncludes`.

### When nnsightful or nnsight changes

To bump either dependency, use the **`update-nnsight-deps` skill** (`.claude/skills/update-nnsight-deps/SKILL.md`). It runs the right uv/bun commands, refreshes both lockfiles, and points at the most likely break sites.

Manual recipe summary (skill has the full version):

- **nnsight** (PyPI, Python only): `uv lock --upgrade-package nnsight && uv sync`
- **nnsightful** (git, both langs): `uv lock --upgrade-package nnsightful` and (inside `workbench/_web`) `bun update nnsightful`, then `uv sync` from the repo root.
- Verify with `bunx tsc --noEmit` in `workbench/_web/`. Do **not** run `next build` while the dev server is up.
- Most likely break sites after a nnsightful bump: `_api/routes/{logit_lens,activation_patching}.py` and `_web/src/app/workbench/[workspaceId]/{lens2,activation-patching}/[chartId]/components/*.tsx`.

---

## Summary of the architecture (what I learned writing this)

1. **The backend is a thin shim**, not a workhorse. It auths, telemeters, orchestrates NDIF jobs, and maps requests to nnsightful tools. The actual interpretability code lives in nnsightful; the actual model execution lives in NDIF (or local nnsight when `REMOTE=false`).
2. **Persistence is fully on the frontend's DB layer.** Backend has no DB. Charts/configs/documents/workspaces all flow through Drizzle → Supabase or local SQLite. This is why durability for the generation panel needs to be added to the frontend DB, not the backend.
3. **Two-DB setup is real and tested.** Schemas are mirrored across `schema.pg.ts` and `schema.sqlite.ts`; `bun:test` exercises the SQLite path. New tables must be added to both files.
4. **nnsightful is the load-bearing dependency** for both visualization (frontend widgets) and experiments (backend tools). It's git-installed, locally symlinked, and transpiled. Breaks here will surface as cryptic build/runtime errors.
5. **NDIF is the model-execution backplane.** Job ID polling is a first-class concern (see `startAndPoll.ts` and the `state.remote` branches in every tool route). Anything model-touching has to think in start→poll→results.
6. **shadcn primitives + a clear panel-header pattern carry the design language.** New UI that copies the panel pattern, reuses primitives, and respects the few hard rules in §4 will look native. New UI that doesn't will look like a separate product.
7. **Auth is Supabase cookies refreshed by middleware**, with `NEXT_PUBLIC_DISABLE_AUTH=true` short-circuiting both client and server to a stub user. The same pattern (`X-User-Email` header) propagates identity to the FastAPI backend.

## Areas this doc may need updating

- **Generation-history persistence**: the rail currently uses zustand+localStorage; once the DB-backed `generations` table lands, §5 and §6 should reflect "history is server-truth, zustand is composer drafts + collapse + optimistic pendings only."
- **Migration folders** (`pg-migrations/`, `sqlite-migrations/`): currently empty in this checkout. If they get committed, document where to find migration history and how to reset.
- **Lens v1**: explicitly hidden as of commit `d7393ca`. If it's removed entirely, drop the `[chartId]/` route mention in §3.
- **Streaming generation**: when (if) the backend grows real streaming for `/models/start-generate`, §10 ("UI assumptions") and the generation-rail loading state need updating; today everything is polling.
- **NotebookExporter**: explored only briefly here; `actions/notebook.ts` and `src/notebook-templates/` could justify a sub-section if more tools acquire export support.
- **Modal deployment**: `modal/` and `make modal` are present but I didn't read them in depth; document if they become a hot path for contributors.
- **k6 / Playwright tests**: only stubs exist; once the test surface grows, add a "Testing" section detailing what's covered.
- **Telemetry**: InfluxDB telemetry sketched in `_api/telemetry.py` but not exercised in the frontend; document if frontend telemetry is added.
