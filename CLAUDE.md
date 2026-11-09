# CLAUDE.md — workbench

Practical guidance for coding agents working in this repo. Specific to this codebase, not generic advice.

If you're proposing visual UI changes, also follow `.claude/skills/product-native-frontend-design/SKILL.md` — it captures the bar this app is held to.

---

## 1. Project Overview

**Workbench** is an interactive web UI for AI interpretability research. Researchers open a workspace, load an open-source LLM, and run interpretability "tools" (logit lens, j-lens, activation patching, Patch Lens) against it. Results are visualized as charts and saved per-workspace.

**Top-level concepts**
- **Workspace** — a folder of saved work. Owned by one user. Holds charts and documents (research notes). Each user also has one **default workspace** (`workspaces.is_default`, created lazily by `getOrCreateDefaultWorkspace` in `src/lib/queries/workspaceDb.ts`) that holds the charts and reports not filed in a folder; it is never listed as a folder, renamed or deleted. Charts and reports move between workspaces with `moveChart` / `moveReport` (a chart's config and lens runs move with it). A user's folder names are unique, ignoring case (`createWorkspace` / `renameWorkspace` refuse a taken one).
- **Model** — an open-source LLM that the active backend can host (e.g. `meta-llama/Llama-3.2-1B`). The header's pick is `useWorkspace.selectedModel` (a model name), read through `selectedModelIn`; a chart with no model of its own starts on `defaultModel` (a hot model the user may run, then any hot, then warm, never cold while one of those can run the tool), and Home's composer uses the same rule.
- **Chart** — a single experiment + its visualization (currently: logit-lens / jlens / activation-patching / patch-lens). One chart row = one config row = one display. Patch Lens shows source/target logit-lens heatmaps plus a single-cell patch (causal mediation), with its run history in `lens_runs`.
  - `"lens2"` is a legacy alias of the `"logit-lens"` tool type, still accepted when reading `configs.type`, `charts.type`, `workshops.allowed_tools` and saved chart embeds until the stored rows are migrated (`normalizeToolType` in `src/types/charts.ts`, and `normalizeWorkshopTools` in `src/lib/workshop.ts` for workshop allowed tools). Writes always use `"logit-lens"`; old `/workbench/<ws>/lens2/<chartId>` links redirect to `/logit-lens/<chartId>` (`next.config.js`).
- **Config** — the parameters that produced the chart (prompt, topk, etc.). Stored as `jsonb` in the `configs` table.
- **Document** — a Lexical-based research note inside a workspace.
- **Chat** — a conversation with a model, filed in a workspace like a chart (`chats` + `chat_messages`; `/chat/<chatId>`). Its `mode` is `chat` (the model's chat template, turn by turn) or `completion` (one text a base model continues); a new chat takes the mode of its model (`chatModeFor`: `is_chat`), and the composer can switch it. Replies run through nnsightful's `generate` tool on `/chat/generate` and arrive whole: NDIF sends nothing back before a job completes, so the stream before the reply carries status only. A chat keeps its sampling settings in its `data` JSON, and each message keeps its role in `data`, with a reply's run there too (`pending` → `complete` or `error`, model, settings, token count, and the reasoning a model like gpt-oss keeps apart from its text, shown folded above the reply). A reply reads as markdown (`ReplyMarkdown`: react-markdown with `remark-gfm`, raw HTML shown as text, images as links) and its </> button shows the raw text; a pending reply's "Waiting for the reply…" shimmers (`text-shimmer`). A chat's page sits on the aurora's base without its glows (`aurora-base`, the same tint as Home's `aurora-bg`); only what queries filter or sort by, and the mode that tells chats from completions, are columns; a reply still pending when its chat opens in a new page load is marked interrupted and offers Retry. Messages form a tree (`parent_id`; `position` is the depth) and nothing finished is overwritten: Regenerate adds a sibling reply, a message sent after an unanswered one becomes another version of it in chat mode, and `chats.head_message_id` is the end of the branch on screen (`branchTo`; the "‹ 2 / 3 ›" switcher moves it with `showBranch`). Retry reruns a failed reply in place. Home's composer starts a chat too (Chat in its tool picker, `useLaunchChat`): the chat is created with its first message and the reply starts in one step (`createChatWithMessage`), while the shell shows the chat's page at once (`PendingChatPage`) with the composer gliding down from Home's; signed-out visitors get there through `/new?tool=Chat…` (`ChatLaunch`). Workshop workspaces hold no chats.
- **Workshop / tutorial** — a workshop is a join link (`/w/[slug]`) that signs participants in anonymously (optionally carrying Prolific IDs) and gives each a workspace limited to the workshop's tools and (unless the workshop allows changing it) its model. It runs a DB-backed guided Patch Lens tutorial (`tutorials` table); participant progress goes to `tutorial_events`. Both are managed under `/admin` (`ADMIN_EMAILS` allowlist). Anonymous participants (`hasWorkshopClaim`) are kept inside their workshop workspace: pages outside it redirect them there (`redirectWorkshopParticipant` in `src/lib/auth/user.ts`), the shell shows them only the workshop sidebar, and they never get a default workspace. Workshop workspaces can't be renamed, deleted or moved into or out of.

**High-level architecture**
```
[Next.js frontend  :3000] ──HTTP──► [FastAPI backend  :8000] ──nnsight──► [NDIF remote] OR [local model]
       │                                  │
       │                              telemetry → InfluxDB
       │
       ├─server actions──► [Postgres (Supabase) OR local SQLite] via Drizzle
       └─auth via Supabase SSR cookies
```
The backend speaks `nnsight` to either NDIF (remote model deployments) or local weights; it's stateless from the frontend's POV — all persistence is on the frontend's DB layer. The nnsightful tool routes (logit lens, j-lens, activation patching) stream each run back as Server-Sent Events; the other model routes return a `job_id` that the frontend polls.

---

## 2. Tech Stack

| Layer | What |
|---|---|
| Framework | Next.js 15.5.9 App Router, React 18.3.1, Turbopack dev |
| Runtime | Bun for install + tests; Node for `next dev` |
| Language | TypeScript (strict but `ignoreBuildErrors: true` in `next.config.js`) |
| Design system | shadcn/ui (style `new-york`, base `zinc`), Tailwind 3.4.17, Radix primitives, Lucide icons, Motion (`framer-motion`/`motion`) |
| State | zustand 5 (UI/ephemeral), `@tanstack/react-query` 5 (server data) |
| Forms / inputs | Lexical for the document editor |
| Charts | Nivo (`@nivo/line`, admin analytics only), nnsightful widgets (LogitLensWidget, ActivationPatchingWidget), `edulogitlens` (CausalMediationExplorer, LogitLensGrid) for Patch Lens |
| Database | Drizzle ORM 0.44 with **two backends** chosen at runtime by `NEXT_PUBLIC_LOCAL_DB`: <br>• Postgres via `postgres-js` (Supabase) <br>• SQLite via `better-sqlite3` (local dev) or `bun:sqlite` (under bun test) |
| Auth | Supabase SSR (`@supabase/ssr`); short-circuited to a stub user when `NEXT_PUBLIC_DISABLE_AUTH=true` |
| Backend | FastAPI on Python 3.12, nnsight ≥0.8.1 + nnterp (git, pulled in by nnsightful) + transformers ≥5.11, deployed via Docker / Modal |
| Telemetry | PostHog: product analytics and error tracking, client (`posthog-js`) and server (`posthog-node`); see §7. InfluxDB client in the backend (off) |
| Toasts | `sonner` |
| Testing | `bun:test` for DB integration and unit tests (`src/**/__tests__`); Playwright for e2e (`tests/`) |

---

## 3. Repository Structure

Two cohabiting trees at the repo root:
- `workbench/_api/` — FastAPI backend
- `workbench/_web/` — Next.js frontend

```
workbench/                          # repo root
├── pyproject.toml                  # Python deps (FastAPI, nnsight, nnsightful)
├── Makefile                        # docker/modal commands
├── scripts/
│   ├── api.sh                      # `uvicorn _api.main:app --host 0.0.0.0 --port 8000 --reload`
│   ├── web.sh                      # `bun install; bun run dev`  (`--local` flag symlinks nnsightful)
│   ├── e2e.sh                      # local Playwright run: SQLite + `next build` + real-NDIF backend
│   ├── docker.sh / modal.sh / test.sh
├── docker/                         # Dockerfiles for the API
├── modal/                          # Modal deployment config
├── supabase/config.toml            # Supabase CLI project for `supabase start` (local / CI)
│
├── workbench/_api/                 # Python backend
│   ├── main.py                     # FastAPI app + CORS + router mounts
│   ├── auth.py                     # X-User-Email header → user identity
│   ├── state.py                    # AppState: model registry, NDIF backend factory, model metadata
│   ├── metadata.py                 # HuggingFace metadata + support checks + organizations (OrgMetadata: logo), cached in _metadata_cache.json
│   ├── sse.py                      # ToolEventStream: runs a tool, streams status/data/error events
│   ├── data_models.py              # NDIFResponse, Token, ModelHeat shared types
│   ├── telemetry.py                # InfluxDB telemetry client
│   ├── _model_configs/             # per-deploy model lists (TOML)
│   └── routes/
│       ├── __init__.py             # registers nnsightful with NDIF (`ndif.register(nnsightful)`)
│       ├── models.py               # /models  (list, /start-generate, /results-generate)
│       ├── logit_lens.py           # /logit_lens/run  (streams nnsightful.tools.logit_lens)
│       ├── j_lens.py               # /j_lens/run  (streams nnsightful.tools.j_lens)
│       ├── activation_patching.py  # /activation_patching/run (streams nnsightful.tools.activation_patching)
│       ├── causal_mediation.py     # /causal_mediation/start + /results/{job_id}  (Patch Lens patch; polled)
│       └── chat.py                 # /chat/generate  (streams nnsightful.tools.generate: a chat reply or a continuation)
│
└── workbench/_web/                 # Next.js frontend
    ├── package.json
    ├── next.config.js              # transpiles nnsightful + edulogitlens; turbopack root expanded for the symlink
    ├── middleware.ts               # next middleware → updateSession (Supabase cookie refresh)
    ├── instrumentation.ts          # onRequestError: server errors → PostHog (with the request's PostHog id)
    ├── tailwind.config.ts          # tokens (radius, primary, etc.) — see globals.css
    ├── drizzle.config.ts           # picks pg or sqlite by NEXT_PUBLIC_LOCAL_DB
    ├── components.json             # shadcn config
    ├── eslint.config.mjs
    ├── playwright.config.ts
    ├── pg-migrations/              # drizzle-generated, gitignored
    ├── sqlite-migrations/          # drizzle-generated, gitignored
    ├── scripts/copy-env.js         # copies repo-root .env → _web/.env (runs in `dev` script)
    ├── tests/                      # Playwright e2e
    └── src/
        ├── app/                    # Next App Router
        │   ├── layout.tsx          # Theme + Query + Tour + PostHog providers; Toaster
        │   ├── login/
        │   ├── auth/callback/, auth/magic-link/
        │   ├── admin/              # workshops + tutorials admin, workshop analytics (ADMIN_EMAILS)
        │   ├── w/[slug]/           # workshop join link → anonymous participant workspace
        │   ├── workbench/page.tsx  # the old Home URL: redirects to / (old launch params → /new)
        │   ├── workbench/[workspaceId]/page.tsx   # "open workspace": its most recent chart, or a new one
        │   └── (shell)/            # route group; layout.tsx is the app shell (persists across pages)
        │       ├── error.tsx       # in-shell error state (sidebar kept); reports the exception
        │       ├── page.tsx        # `/`: the landing page without a session (shown without the shell),
        │       │                   #   else Home: the landing page's composer (LandingComposer)
        │       ├── components/     # UI shared by the routes below
        │       │   ├── shell/       # AppShell (sidebar + page, rail/drawer state), AppSidebar, LibrarySidebar
        │       │   │                #   (global sidebar), SidebarRows, SidebarFooter, SidebarResizeHandle, PageHeader
        │       │   ├── items/       # ItemPage (chart/report header), ItemActionsMenu (rename, copy, move,
        │       │   │                #   delete), WorkspaceActions (a workspace's rename, delete), NewItemMenu,
        │       │   │                #   itemLabel (how items read in lists), workspaceContents (how a
        │       │   │                #   workspace's contents read), covers (report and folder covers)
        │       │   ├── WorkspaceScopes.tsx      # server wrappers that look up an item's workspace scope
        │       │   ├── ChartCardsSidebar.tsx, ChartCard.tsx, ReportCard.tsx  # workshop (workspace-scoped) sidebar
        │       │   ├── MobileCollapsibleControls.tsx
        │       │   ├── ToolPanelHeader.tsx      # title row shared by the tool Controls
        │       │   ├── ChartExportMenu.tsx      # a chart's Export menu (in ItemPage's header): image, and notebook
        │       │   │                            #   where a template exists
        │       │   ├── ModelDeployingPanel.tsx, DeployCard.tsx  # cold-model deploy states
        │       │   └── PendingRequestHandler.tsx  # resumes a launch that waited on sign-in
        │       ├── logit-lens/[chartId]/        # logit-lens chart (nnsightful widget)
        │       ├── j-lens/[chartId]/            # j-lens chart (nnsightful LogitLensWidget)
        │       ├── activation-patching/[chartId]/
        │       ├── patch-lens/[chartId]/        # Patch Lens (edulogitlens), run history rail, guided tutorial
        │       ├── reports/[reportId]/          # Lexical report editor
        │       ├── chat/[chatId]/               # a chat: thread (or completion document) over its composer
        │       ├── new/            # /new?tool=…&model=…&prompt=…: creates a chart (or, for tool=Chat, a chat), then opens it
        │       ├── models/         # models grid (scrolls under its header)
        │       └── workspaces/     # all workspaces (folders); [workspaceId]/ is one folder, its items as
        │                           #   preview cards (FolderItemCard, useChartPreview) or rows (FolderItemRow)
        │
        ├── components/             # app-wide composed components
        │   ├── ui/                 # shadcn primitives (Button, Card, Popover, PillPopover, ...)
        │   ├── charts/             # ChartModelPill (stale-model pill), theming.ts (Nivo theme)
        │   ├── activation-patching/  # toolkit.tsx (shared AP state, prompt section, patch arrows)
        │   ├── model-selector/     # ModelPopover (model picker body), status.ts (model heat vocabulary)
        │   ├── models/             # ModelsSection (the models grid on /models), ModelLaunchDialog,
        │   │                       #   OrgAvatar (a card's publisher logo)
        │   ├── providers/          # QueryProvider, ThemeProvider, TourProvider, TutorialEventProvider
        │   ├── ModelControl.tsx    # header model pill + picker; its job badge shows useWorkspace.jobStatus
        │   ├── LandingPage.tsx (signed out), LandingComposer.tsx (its hero + composer, also Home's)
        │   ├── CwLogo.tsx          # the workbench mosaic, self-contained (inline styles); its mark sits beside
        │   │                   #   the product name in the hero and the sidebar, and expands the rail
        │   ├── UserDropdown.tsx, CreateWorkspaceDialog.tsx
        │   └── ...
        │
        ├── stores/                 # zustand stores
        │   ├── useWorkspace.ts     # selectedModel (by name), jobStatus
        │   ├── useModelDeployment.ts    # cold-model warmups in flight, keyed by model
        │   ├── useSidebarFolders.ts     # how the sidebar was left: open folders, folded sections (persisted)
        │   ├── useWorkspaceView.ts      # the workspace page's layout, grid or list (persisted)
        │   ├── usePromptFocus.ts        # one-shot: a launch asks the chart or chat it opens to focus its prompt
        │   ├── usePendingItem.ts        # the chart or chat a launch is creating, shown as its page meanwhile
        │   ├── usePatchLensTutorial.ts  # patch-lens tour "completed" flag (localStorage)
        │   └── useProlificTutorial.ts   # guided-tutorial progress + panel UI (persisted; resume UX only)
        │
        ├── hooks/
        │   ├── useToolArea.ts      # shared chart/config/model loading for the logit-lens / j-lens / AP *Area
        │   ├── useChartModelReady.ts    # whether a chart shows its deploying state (page + sidebar)
        │   ├── useFocusNewChartPrompt.ts  # a tool's Controls focus their empty prompt for usePromptFocus
        │   ├── useLaunchChart.ts   # starts a chart from inside the app without loading /new
        │   ├── useLaunchChat.ts    # starts a chat with its first message from Home's composer
        │   ├── useDraftModel.ts    # chart's locally committed model (Reset / Sync)
        │   ├── useBackgroundTokenPair.ts    # tokenize a prompt under two models to compare
        │   ├── useBlurTokenizeScheduler.ts  # cancellable auto-tokenize after textarea blur
        │   ├── useTutorialManager.ts    # advances tour steps on app events
        │   └── useIsMobile.ts, useIsDark.ts
        │
        ├── lib/
        │   ├── config.ts           # backendUrl + ndifUrl + endpoint paths
        │   ├── runAndStream.ts     # SSE client for the nnsightful tool routes
        │   ├── startAndPoll.ts     # NDIF job polling (causal mediation)
        │   ├── ndifJob.ts          # NDIFJob: follows one NDIF job's statuses, timed into a run's JobSink
        │   ├── ndifError.ts        # NDIFJobError: a failed job's Python exception, parsed from its traceback
        │   ├── analytics.ts        # PostHog event names, useCapture, useTrackRun (run lifecycle)
        │   ├── errorTracking.ts    # captureError: handled failures → PostHog error tracking
        │   ├── errorRedaction.ts   # cuts a failed query's bound values out of reported errors
        │   ├── chartRoutes.ts      # chart tool type ↔ its page route (unknown/retired types → workspace root)
        │   ├── toolSupport.ts      # which tools a model supports (j-lens needs `has_jacobian`)
        │   ├── utils.ts            # cn(), resolveThemeCssVars()
        │   ├── queryKeys.ts        # all React Query keys
        │   ├── api/                # CLIENT-side API wrappers (use*Mutation hooks)
        │   ├── queries/            # *Db.ts: unguarded DB internals; *Queries.ts: "use server" RPC wrappers
        │   ├── auth/user.ts        # requireUser/requireUserId, workshop participant redirect
        │   ├── auth/admin.ts       # ADMIN_EMAILS allowlist, requireAdmin()
        │   ├── supabase/           # client.ts, server.ts, middleware.ts, admin.ts
        │   └── posthog-server.ts   # PostHogServer: server-side events and exceptions, sent before returning
        │
        ├── actions/                # SERVER actions used as RPCs from the client
        │   ├── auth.ts             # createUserHeadersAction → { "X-User-Email": ... }; magic-link sign-in
        │   ├── notebook.ts         # builds .ipynb from chart data + nnsightful viz
        │   ├── tok.ts              # encodeText (transformers.js tokenizer)
        │   ├── workshop.ts         # joinWorkshopAction (anonymous sign-in + workshop workspace)
        │   └── errors.ts
        │
        ├── db/
        │   ├── schema.pg.ts        # Postgres tables (jsonb, uuid, timestamp)
        │   ├── schema.sqlite.ts    # SQLite mirror (text json, integer timestamp)
        │   ├── schema.ts           # picks one based on NEXT_PUBLIC_LOCAL_DB; exports types
        │   ├── client.ts           # `db` instance — pg via postgres-js OR sqlite via better-sqlite3 / bun:sqlite
        │   └── __tests__/          # bun:test integration tests against .test.db
        │
        ├── types/                  # shared TS types (charts, logitLens, jlens, patchLens, lensRun, models, ...)
        ├── tutorials/              # Patch Lens tour steps, glossary, guided-tutorial seed content
        └── notebook-templates/     # .ipynb skeletons that ChartExportMenu's notebook export fills
```

---

## 4. Frontend Architecture Guidelines

### Container vs presenter

Every non-trivial feature has **one container** (knows about URL params, stores, calls server actions/APIs) and **N presentational children** (props in, JSX out). Examples to follow:
- `app/(shell)/patch-lens/[chartId]/components/LensHistoryRail.tsx` is the container (route params + run-history queries); `LensHistoryStrip.tsx` is presentational (`run`, `isActive`, `onSelect` props).
- `app/(shell)/logit-lens/[chartId]/components/LogitLensArea.tsx` loads chart, config and model state through `useToolArea` (shared with the j-lens and activation-patching `*Area`) and passes them to `LogitLensControls.tsx` as props.

### Where to put new files

| Component shape | Location |
|---|---|
| Generic primitive, no app types in props | `src/components/ui/` (`Button`, `PillPopover`, `Tooltip`, …) |
| App-wide composed, used in many unrelated places | `src/components/` (`ModelControl`, `UserDropdown`) |
| Decoupled from URL/state but **takes app domain types** in props (e.g. `LensHistoryStrip`'s `run` prop) | feature folder co-located with its route → `app/<route>/components/<feature>/` |
| Reads URL params or stores or calls APIs | same feature folder, marked as the container |

**Default to feature-local.** Promote to `src/components/` only when a second real consumer appears. Premature abstraction is a quality regression.

### Reusing `components/ui`

Always reach for the existing primitive first. The catalog: `badge, button, card, checkbox, dialog, dropdown-menu, input, label, mode-toggle, pill-popover, popover, resizable, search-input, select, separator, sheet, slider, sonner, textarea, tooltip, truncated-text`. Don't fork them for cosmetic tweaks — pass `className` and merge with `cn()` from `lib/utils`.

If a primitive is missing (e.g. a Switch), prefer adding a thin wrapper around the existing Radix package (`radix-ui`, already a dep) over hand-rolling.

### Styling rules (this app's actual tokens)

Defined in `src/app/globals.css`:
- `--radius: 0.375rem` — use `rounded-md` (≈radius), `rounded` (≈radius+1px); avoid `rounded-xl`/`rounded-lg` mixed with these.
- `--font-sans: Inter`, `--font-mono: JetBrains Mono`, `--font-serif: Source Serif 4`.
- `--primary: 217 91% 60%` (a blue) — used for the most important CTA and active/selected state.
- Light mode's greys (`--background`, `--secondary`, `--muted`, `--accent`, `--border`, `--input`) are tinted toward the brand blue (hue 220), so surfaces sit with the blue gradients instead of reading flat. Take greys from these tokens, never a neutral `gray-*` or hand-written grey. Outline buttons fill with `--card` (white).
- Shadow ramp: `--shadow-xs … --shadow-2xl`. Default cards use `shadow-xs` or `shadow-sm`.
- Sidebar surfaces use `bg-secondary/80` (light) and `bg-secondary/50` (dark), bordered, with `rounded`.

**Hard rules**:
- `font-mono` ONLY on content the user reads as data: code, prompts, outputs, tabular numbers. Never UI chrome.
- No tracked-uppercase tiny labels (`text-[10px] uppercase tracking-…`) — the rest of the app uses sentence-case `text-sm font-medium`.
- No arbitrary `text-[Npx]`. Use Tailwind's standard scale (`text-xs`, `text-sm`).
- One radius token per feature.
- Scrollbars are styled once, in `globals.css` (thin, a muted thumb on a clear track). Don't restyle them per component; to hide the thumbs inside an element until it's hovered, set `--scrollbar-thumb` to transparent there, as `AppSidebar` does.

Existing panel header pattern (copy this exactly when adding a new panel):
```tsx
<div className="p-3 border-b flex items-center justify-between">
  <h2 className="text-sm pl-2 font-medium">Title</h2>
  <div className="flex items-center gap-2">…controls…</div>
</div>
```
See `LogitLensArea.tsx`, `ActivationPatchingArea.tsx`, and `ToolPanelHeader.tsx` (the title row shared by the logit-lens, j-lens and activation-patching Controls).

### Avoiding off-brand / AI-looking UI

Refuse on sight: ✨ Sparkles icons, `> ` terminal glyphs, dotted-grid backgrounds, hand-rolled switches/toggles, multiple concurrent loading indicators, "Streaming" labels on polling APIs, marketing-style hero copy on internal tools, `backdrop-blur-sm` on opaque surfaces, hidden-until-hover actions on touch surfaces. See the `product-native-frontend-design` skill for the full list.

---

## 5. State Management Guidelines

Pick the lightest location that does the job:

| Use | Where | Examples |
|---|---|---|
| UI-only, ephemeral | `useState` | composer focus, draft text, hover |
| Survives reload, shareable | URL search params | chart launch from the landing page (`/new?tool=…&model=…&prompt=…`) |
| Server data | React Query | charts, configs, documents, models list, lens runs |
| Cross-page UI | zustand | `useWorkspace` (selected model; job status, shown as the job badge in the header's model pill), `useModelDeployment` (cold-model warmups in flight) |
| Survives reload, no server | localStorage via zustand `persist` | `workbench:sidebar-folders` (`useSidebarFolders`), `workbench:workspace-view` (`useWorkspaceView`), `workbench:prolific-tutorial` (`useProlificTutorial`) |
| Survives reload, needed on the server's first render | cookie | `workbench_sidebar_collapsed` and `workbench_sidebar_width`: the shell layout reads them so the sidebar renders at the right width (`shell/sidebarCookie.ts`; no collapsed cookie means the rail). The app-shell e2e tests set the collapsed cookie to `false` so they start expanded |
| Many descendants need read | React Context | `TutorialEventProvider` (`components/providers/TutorialEventProvider.tsx`), the workspace scope (below) — rare |

**zustand is for ephemeral UI state, not durable history.** Long-term history belongs in the DB: Patch Lens run history is `lens_runs` rows, and `useProlificTutorial` persists to localStorage only as resume UX while `tutorial_events` rows are the source of truth.

**The workspace is not in the URL.** Chart (`/<tool>/<chartId>`) and report (`/reports/<reportId>`) routes look up the item's workspace in their server `layout.tsx` and provide it through `WorkspaceScopeProvider` (`components/providers/WorkspaceScopeProvider.tsx`). Read it with `useScopedWorkspaceId()` inside those routes, or `useWorkspaceScope()` where it may be absent (it also reaches the shell layout through `WorkspaceScopeHost`). After moving the item on screen, `router.refresh()` so the scope is re-read (`useMoveChart` / `useMoveReport` do). Build links with `src/lib/chartRoutes.ts`.

**Bucket persisted state by its natural key.** `useProlificTutorial` is bucketed by `workspaceId` and resets on a workspace change. If you add similar features, follow the pattern.

**On rehydrate, clean up impossible states.** See `useProlificTutorial`: `setUnits` clamps the persisted `unitIdx` to the loaded tutorial, and `pruneRunKeys` drops persisted answer keys that don't belong to the run on screen.

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

Migration folders are `pg-migrations/` and `sqlite-migrations/`, generated locally and gitignored.

### Existing patterns for new entities

Look at `charts` / `configs` for the canonical shape:
- One row per entity; flexible payload in a `jsonb`/`json` column typed via `$type<T>()`.
- `userId` is stamped on `workspaces` only; child tables cascade through `workspaceId` FK.
- Auth is enforced in the server action body (e.g. `getUserWorkspaces()` resolves the user, then calls `getWorkspaces(userId)`), not by the DB.

### Server vs client query layers

Three files for each entity:
- `src/lib/queries/<entity>Db.ts` — unguarded internals that call `db` (e.g. `workspaceDb.ts`, `chartDb.ts`, `chatDb.ts`, `documentDb.ts`, `configDb.ts`, `lensRunDb.ts`). Writes take the acting user's id and only touch that user's rows. Server code (pages, layouts, other actions) and the `bun:test` suites call these directly.
- `src/lib/queries/<entity>Queries.ts` — `"use server"` directive. **Every export is a public RPC endpoint**, so each one resolves the signed-in user itself (`requireUser()` / `requireUserId()` from `src/lib/auth/user.ts`; never a client-supplied user id) and calls the `*Db.ts` internal, or checks admin access (`requireAdmin()`). A `"use server"` file may export only async functions (and types). Export nothing here that only tests or server code need; put it in `*Db.ts`.
- `src/lib/api/<entity>Api.ts` — client-side React Query wrappers (`useQuery`, `useMutation`). Calls server actions or external HTTP (FastAPI / NDIF).

Keep them split. Server actions are RPCs invoked from client mutations.

How a `*Db.ts` write checks ownership:
- **Keyed by an item id** (update, delete): one statement whose `WHERE` carries an owner subquery (`isUserChart`, `isUserDocument`, `isUserConfig`, `isUserRun`), then throw "… not found or access denied" when it matched nothing. Don't read the row, compare, then write.
- **Creating under a parent** (a chart in a workspace, a run on a chart, a tutorial event in a workspace): check that the parent is the user's first, and take the workspace from the parent row rather than from the client.
- **Configs and lens runs belong to their chart.** Their owner check goes through the chart (`chart_config_links` for configs), not the row's own `workspaceId`, which only follows the chart (`moveChart` moves it).
- **Workshop participants** are anonymous Supabase users who own their workshop workspace, so these checks cover them with no special case. Test each guarded write in `src/db/__tests__/itemOwnership.test.ts`: refused for another user, allowed for the owner and for a participant in their workshop workspace.

Lens-run reads are owner-checked too: they return nothing for another user's runs. Chart and report reads keyed by id (`getChartById`, `getConfigForChart`, `getChartsMetadata`, `getDocumentById`, `getDocumentsForWorkspace`) and the participant reads keyed by workspace (`getWorkshopForWorkspace`, `resolveTutorialForWorkspace`, `getTutorialNotesForWorkspace`) are not. Whether they should be depends on whether charts become shareable by link.

### Run history (`lens_runs`)

Patch Lens prompt history is the reference for durable per-run history:
- **One row per successful run**, cascading through `workspaceId` and `chartId` like `configs`. `model` is its own column because the history rail filters by it.
- **Owned through the chart.** `createLensRun` files a run under its chart's current workspace, and every `lensRunDb.ts` function matches only runs on the user's charts, so the client sends chart and run ids but never a workspace id.
- **Split storage.** `summary` (JSON) is the compact slice the rail lists; `data` (JSON) holds the full heatmaps and is fetched by id on demand (`queryKeys.lensRuns.heatmaps`).
- **History writes are best-effort.** A failed write must not fail an otherwise successful run (see `runPatchLensLogitLens`).
- **Use JSON columns** for payloads whose shape evolves; promote a field to a column only when you query by it.

---

## 7. API / Query Patterns

### Backend HTTP layer

Frontend ↔ FastAPI:
- `src/lib/config.ts` lists every endpoint path. **Add new routes here**, don't hardcode.
- `src/lib/runAndStream.ts` runs the nnsightful tools (`/logit_lens/run`, `/j_lens/run`, `/activation_patching/run`): one POST whose response is a stream of Server-Sent Events — `status` for each NDIF update, then `data` or `error` (see `workbench/_api/sse.py`).
- `src/lib/startAndPoll.ts` is the NDIF job runner for causal mediation (`lib/api/patchLensApi.ts`): POST start → poll `ndif.us/response/{job_id}` until COMPLETED → POST results.
- Both update `useWorkspace.jobStatus` ("QUEUED: 3", "Idle", etc.), which the header's model pill shows as its job badge (`parseJobStatus` → `JobBadge` in `src/components/ModelControl.tsx`).
- `src/lib/api/deployApi.ts` warms a cold model: it fires `/models/start-generate` with a one-token prompt and polls the NDIF job until COMPLETED (state lives in `useModelDeployment`, not `jobStatus`).
- All FastAPI calls include the `X-User-Email` header. Build it via `createUserHeadersAction()` from `src/actions/auth.ts`.

### Mutation conventions (see `src/lib/api/logitLensApi.ts`)

```ts
const fn = async (req): Promise<T> => {
  const headers = await createUserHeadersAction();
  return await runAndStream<T>(config.endpoints.runFoo, req, headers);
};

export const useFoo = () =>
  useMutation({
    mutationFn: fn,
    onMutate: ...,    // optimistic
    onError: () => toast.error("..."),
    onSuccess: () => queryClient.invalidateQueries(...),
  });
```

A polled route swaps the `runAndStream` call for `startAndPoll<T>(start, body, results, headers)` (see `usePatchLensIntervention` in `src/lib/api/patchLensApi.ts`).

**Where errors are surfaced**: shared mutations toast via `sonner` in `onError`; a run's toast goes through `runErrorMessage(error, copy)` (`src/lib/ndifError.ts`), which gives advice for a known Python exception (a CUDA out-of-memory) and names any other. If a feature renders its own inline error UI, **export the bare async function** alongside the mutation hook so the feature can call it without the toast — see `runPatchLensLogitLens` next to `usePatchLensLogitLens` in `src/lib/api/patchLensApi.ts`. Don't fork the mutation.

### Analytics and error tracking (PostHog)

- **Event names** live only in `src/lib/analytics.ts` (`AnalyticsEvent`). Emit with `useCapture()`, which adds `workspace_id` (from the workspace scope), the route's `chart_id` / `chat_id` / `report_id`, and the workshop context (`mode`, `workshop_id`, `tutorial_id`, from the workspace scope); outside React, `captureEvent`. An event about an item passes that item's ids, and then gets none of the route's (a report deleted from the sidebar on a chart page carries no `chart_id`). Any event with a `workspace_id` also gets `workspace_is_default`, from the workspace scope or the cached library; a server event with a `workspace_id` sets it itself.
- **Emit once per completed action, from the mutation hook that performs it**, in its `useMutation`-level `onSuccess`, so every surface offering the action counts the same and the event survives the component unmounting (per-call `mutate(…, { onSuccess })` callbacks don't). Read what the event needs from the cache in `onMutate`, before the mutation changes it (`ItemAnalytics` in `src/lib/api/workspaceApi.ts`). A launch carries its surface as `chart_created`'s `origin` (`ChartOrigins` in `src/lib/chartLaunch.ts`; `/new` links carry `origin=`), and a chat's as `chat_created`'s (`ChatOrigin` in `src/lib/chatLaunch.ts`, with `has_message`). A chat reply is a run (`useTrackRun`, `tool: "chat"`): `run_kind` is the chat's mode, `trigger` is `run`, `continue`, `retry` or `regenerate`, and its `prompt` is the message it answers; a failed reply is saved on the message and reported by `run_failed`.
- **Runs** are tracked only by `useTrackRun()` inside a run mutation's `mutationFn`: `run_submitted`, then `run_completed` / `run_failed`, sharing a `run_id`, with `duration_ms`, the NDIF job ids and queue and job times (a `JobSink` handed to `runAndStream` / `startAndPoll`), and the exception class as `error_type`. `run_submitted` carries every parameter the run sends to the backend (settings, positions, prompts); the other two repeat only the `run_id`, tool, model, trigger and run kind (`TrackedRun.SHARED`), so join on `run_id` for the rest. Components never emit run events.
- **Prompts are sent as typed, with their length**: `prompt` and `prompt_length`, or `source_prompt` / `target_prompt` and their lengths for two-prompt tools, on `run_submitted` and `landing_submission`. **Other user-authored text is never sent**: no chart, report or workspace names (send `name_length`), no report content, no request paths (`/new?prompt=…`), no Prolific IDs. posthog-js's own URL properties lose their query strings before sending (`EventUrls` in `app/provider.tsx`), and reported errors lose a failed query's bound values (`ErrorRedaction` in `src/lib/errorRedaction.ts`). A server error message must not echo user input, since server errors are reported too.
- **Errors**: posthog-js captures uncaught errors and unhandled rejections; `app/(shell)/error.tsx` and `app/global-error.tsx` capture what reaches a boundary; `QueryProvider`'s caches capture every failed mutation, and a failed query that has no data to show; `instrumentation.ts` (`onRequestError`) captures server errors with the request's PostHog id and `digest`. A run mutation sets `meta: { reportedAs: "run" }`, since `run_failed` already reports it. Elsewhere, a `catch` that recovers from a real failure (a toast, an inline message) and isn't a mutation calls `captureError(error, { source })` (`src/lib/errorTracking.ts`), which skips cancellations and reports each error once. Don't capture outcomes the UI expects (a failed captcha) or a failure another capture already reports (a query's own failure, `model_warmup_failed`).
- **Server-side events and handled server errors** go through `PostHogServer.capture` / `captureException` inside `after()` (`next/server`), so the response doesn't wait on PostHog while the event still gets sent before the function ends. Request APIs (`headers()`) can't be read inside `after()` in a server component, so read the distinct id first (`PostHogServer.distinctIdFor`).

### Query keys

Centralized in `src/lib/queryKeys.ts`. Add new entries there:
```ts
queryKeys.charts.chart(chartId)
queryKeys.charts.sidebar(workspaceId)
queryKeys.documents.byWorkspace(workspaceId)
queryKeys.workspaces.library   // every workspace with its items (sidebar); invalidate on any item change
```

### React Query defaults

Set in `src/components/providers/QueryProvider.tsx`: `staleTime: 5min`, `retry: 1`. Treat that as the baseline; override per-query when needed.

---

## 8. UI / Design System Rules

### Existing primitives to prefer

`src/components/ui/`: Badge, Button, Card, Checkbox, Dialog, DropdownMenu, Input, Label, ModeToggle, PillPopover, Popover, Resizable, SearchInput (with `useSearchShortcut`: `/` focuses it, Escape clears it), Select, Separator, Sheet, Slider, Sonner, Textarea, Tooltip, TruncatedText (one line ending in "…", with the whole text in a tooltip while it's cut off).

### Layout patterns the app uses

- **App shell** = the `(shell)` layout: a global sidebar (`AppSidebar`; New chart, Home, Models, Workspaces, the workspace folders and the unfiled charts) beside the page. `/` is the landing page without a session (the shell renders it bare, with no sidebar) and Home with one; Home is also where sign-in lands and where the sidebar's product name leads, and `/workbench`, its old URL, redirects there. Home is the landing page's hero and composer (`LandingComposer`, the same component, on the landing page's `aurora-bg`), which starts a chart (`useLaunchChart`); the chart runs the prompt as it opens. Picking Chat in its tool picker starts a chat instead (`useLaunchChat`), its prompt the first message. The composer is one box: the prompt over a toolbar of pickers drawn as outline buttons (tool, model, and the workspace for a signed-in user with folders; `components/selectors/LaunchSelectors.tsx`, shared with the model launch dialog; its model menu shows Base and Chat models as tabs, `groupTabs` on `ModelPopover`) and a compact Run, narrower than the hero's column (`max-w-3xl`); the hero and composer sit above the page's center (a sixth of the free height above them, five sixths below). Keep the two identical: change the composer in `LandingComposer`, not on either page. The sidebar's Workspaces and Charts sections fold under their headers; Workspaces lists the five most recently updated folders (plus the active one) until "Show N more", and a chart row dropped on a folder moves the chart there. New chart, Home's composer and the models page's launch dialog start a chart with `useLaunchChart` rather than loading `/new` (which stays for links and for launches resumed after sign-in): the page area shows the chart's empty page at once (`PendingChartPage`, from `usePendingChart`), and the create action returns the chart's rows, which fill its queries so its page opens without fetching them. A blank launch reopens an untouched blank chart of that tool rather than adding another (`createChartFromLaunch`; only in the default workspace) and lands focus in its prompt. On a chart or report in a folder, the sidebar's New chart and New report file the new item in that folder (`useNewItemWorkspace`). The sidebar collapses to a rail, which is how it starts on a first visit; after that it remembers being expanded or collapsed (`workbench_sidebar_collapsed` cookie; the logo mark at the rail's top expands it). It is a drawer on mobile; expanded, it has its own surface (`sidebar-surface` in `globals.css`, the `--sidebar` tokens) so the pages' cards don't run into it, and its right edge drags to resize it (`SidebarResizeHandle`, `workbench_sidebar_width` cookie). On a workshop workspace's chart, and on every page of a workshop participant, it shows the focused `ChartCardsSidebar` instead (the workshop's tools only, starting as the rail). Every shell page starts with a `PageHeader` (`h-12`; it carries the mobile drawer button); the models page, whose grid's header row (set straight on the page, like its cards) carries its title, shows it only on mobile. Each model card shows its publisher's logo beside the publisher and model names (`OrgAvatar`): the avatar its organization uploaded to Hugging Face (never a person's picture: a model from a personal account gets none), looked up once per account (an `OrgMetadata` record, kept once per account under `orgs` in `_metadata_cache.json`) and carried by each model's record as `org` (`ModelMetadata.org`, filled in by `MetadataCache.fetch_metadata`; optional, so a failed lookup never holds a model back), so `/models` sends it as `org.avatar_url`; the browser loads the image from Hugging Face's CDN, on a white tile in both themes; an account without one, or an image that fails, shows no logo, its names starting at the card's edge. The models page sits on `ndif-liquid` (`globals.css`): the NDIF logo's colors twisted into liquid marbling under a veil and the shared `--powder-grain`, which the report covers use too.
- **Chart pages** = the item header (`ItemPage`: `ModelControl`, the workspace → item breadcrumb, the item's actions) above a `ResizablePanelGroup` of feature panels. The header owns the chart's name and its rename; the tool displays carry no title of their own. A report's header has no model picker. Examples: `logit-lens/[chartId]/page.tsx`, `activation-patching/[chartId]/page.tsx`.
- **Item actions** = `ItemActionsMenu` everywhere a chart or report is listed (sidebar rows, the item header, the workspace page): Rename, Copy, Move to workspace, Remove from workspace, Delete (confirmed in a popover). A workspace's own Rename and Delete (confirmed in a dialog) are `WorkspaceActionsMenu`, on its page, its card in all workspaces and its sidebar folder row; workshop workspaces get neither.
- **Workspace page** = one folder's charts and reports set straight on the page (no surrounding panel): a grid of preview cards (the default) or a list of rows on a card surface, switched in the page header, where the item count sits beside the folder's name (`useWorkspaceView`). A chart card's preview is drawn in the browser the way a report embed draws the chart (`chartFigure` + nnsightful's `snapshotChart`, in `useChartPreview`), except that a logit lens shows only its heatmap, without the layer navigator (nnsightful's `layerNavigator: false`) or the line plot a selected or pinned row opens (`withoutLinePlot`): only once the card is on screen, two at a time, and cached per saved version of the chart and theme, so each visible chart's data is downloaded once per session. A report card shows a `powder-cover` (brand-color blur under a grain, in `globals.css`), placed per report.
- **All workspaces** (`/workspaces`) = one card per folder, set straight on the page: a cover in a color of the folder's own (`folderCover` in `components/items/covers.ts`: one of the NDIF logo's colors, over a `powder-cover`), its name and actions, then its counts, which unfold its items (each opening the item) in the cover's place, scrolling there when they don't fit, so a card never changes size. The header's search (`SearchInput`, as on the models page) keeps the folders whose name or whose charts' and reports' labels hold the query (`searchWorkspaces`); a card found by its items starts unfolded to just those.
- **Feature panel** = bordered, rounded card (`rounded dark:bg-secondary/50 bg-secondary/80 border`) with the standard panel header pattern (see §4).
- **Mobile** = the shell's sidebar drawer (opened from the page header), `MobileCollapsibleControls` (collapsible top section). Mirror these when adding mobile paths.
- **Charts** = each tool's `*Display` component (`LogitLensDisplay`, `JLensDisplay`, `ActivationPatchingDisplay`) renders its nnsightful widget straight from `chart.data`; `PatchLensDisplay` renders `edulogitlens`'s `CausalMediationExplorer`.
- **Modals/dialogs** = used sparingly, only for blocking confirmations or single-step entry.
- **Right-rail** = the guided-tutorial dock on patch-lens (`TutorialDockPanel` in `patch-lens/[chartId]/components/tutorial/TutorialDock.tsx`); it collapses to a slim strip (`TutorialCollapsedRail`) that mirrors the chart sidebar's collapsed state.

### Rules for new surfaces

- **Panels/rails**: copy the existing header pattern exactly. Provide a collapse mechanism if the app has any other collapsible neighbor.
- **Modals**: only for blocking, focused tasks. Confirmations use Popover with destructive Button if the action is contained.
- **Cards**: use the `Card` primitive or match its shape. One radius.
- **Forms**: vertical, grouped via `Label` + input. Use `Checkbox`/`Slider`/`Select` from `components/ui`.
- **Dashboards / data views**: use `Card` for tiles; tabular nums for any number column; persistent low-contrast row actions (not hover-only on touch).

### Accessibility expectations

- Every interactive element keyboard-reachable.
- Focus rings come from primitives — don't custom-style.
- All inputs labelled (`<Label>` or `aria-label`).
- Loading regions use `aria-live="polite"` (see `ModelDeployingPanel`, and `JobBadge` in `ModelControl.tsx`).
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

# nnsightful clone next to `workbench` (only for `web.sh --local`, see §10)
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
bun run test                 # bun:test — but see the warning below; prefer scripts/test.sh
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

### End-to-end tests (Playwright)

There is a real e2e harness — not stubs — in `workbench/_web/tests/`:

- `TestingUtils.ts` — creates real Supabase Auth users via the service role,
  logs in over a magic link with retries, and seeds fixtures. **`seedPatchLensChart(userId)`
  seeds a workspace + three patch-lens charts + `lens_runs` rows, so the patch-lens
  route renders a full heatmap with no NDIF and no Python backend.** Start here
  before writing any new spec.
- `patch-lens-features.spec.ts`, `workshop-join.spec.ts`, `logit-lens.spec.ts`,
  `workshop-admin.spec.ts`, … — specs against the real routes.
- `global-setup.ts` warms gpt2 on NDIF for the specs that do hit a live model.
- `playwright.config.ts` — chromium only, `fullyParallel`, `baseURL` :3000,
  Argos visual reporter (uploads only when `ARGOS_TOKEN` is set).
- `.github/workflows/e2e.yml` installs the Supabase CLI (`supabase/setup-cli`), stands up
  local Supabase in Docker, runs `drizzle-kit push`, grants PostgREST roles, starts the
  FastAPI backend against real NDIF (`CONFIG=e2e`, `REMOTE=true`), then runs the suite.
- `scripts/e2e.sh` (repo root) runs the suite locally on SQLite with auth disabled: it
  pushes the schema, runs `next build`, starts the real-NDIF backend, then Playwright.
  It builds, so don't run it while `next dev` is up.

Two gotchas:

- **`webServer.command` is `bun run start`, which needs a build.** Since you must not
  run `next build`, start `bun run dev` yourself first — `reuseExistingServer` is
  true outside CI, so Playwright attaches to your dev server instead of building.
- **Most of the harness is CI-shaped.** Specs that create real Auth users or hit
  Postgres need `SUPABASE_SERVICE_ROLE_KEY`, so running those locally means
  `supabase start` plus an `.env` rewrite — usually cheaper to let CI run them on the PR.
  `supabase start` needs the Supabase CLI, which isn't an npm dependency; install it
  per Supabase's official instructions.
  **`tutorial-checks.spec.ts` is the exception**: it seeds SQLite directly and uses the
  stub user, so it runs on a plain local setup. With `NEXT_PUBLIC_LOCAL_DB=true`,
  `NEXT_PUBLIC_DISABLE_AUTH=true` and `LOCAL_SQLITE_URL` pointing at a writable file in
  the repo-root `.env`, from `workbench/_web`:

  ```bash
  bunx drizzle-kit push --force     # the app DB needs a schema; `bun run dev` won't create it
  bun run dev                       # terminal 1
  bunx playwright test tests/tutorial-checks.spec.ts   # terminal 2
  ```

  `reuseExistingServer` is true outside CI, so Playwright attaches to the dev server and
  `bun run start` (a build) never fires. Note `playwright.config.ts` hardcodes
  `localhost:3000` — if another project owns that port the suite silently tests the wrong
  app, so either free the port or point `baseURL` at your dev server.

To avoid a live model in a new spec, stub the tool endpoint. A tool route
(`/logit_lens/run` etc.) answers with a stream, so the stub is a single SSE
`data` event:

```ts
await page.route("**/logit_lens/run", (route) =>
    route.fulfill({
        contentType: "text/event-stream",
        body: `event: data\ndata: ${JSON.stringify(LENS_FIXTURE)}\n\n`,
    }));
```

### ⚠️ Warnings

- **Do NOT run `next build` while the user's `next dev` is running.** Both write to `.next/`; the build clobbers manifest tempfiles, leaving the dev server with `ENOENT _buildManifest.js.tmp.*` and 500s on server actions. Verify with `bunx tsc --noEmit` and `bun run lint` instead. Recovery if it happens: stop the dev server, `rm -rf .next`, restart.
- **Auth disabled mode** (`NEXT_PUBLIC_DISABLE_AUTH=true`) returns a stub user (`dev@localhost`) from `src/lib/supabase/server.ts`; useful for local dev without Supabase.
- **Run the test suite via `bash ./scripts/test.sh` from the repo root, not `bun run test`.** The `test` script is a bare `bun test`, and the DB integration tests need `.test.db` to have a pushed schema. On a fresh checkout (or whenever `.test.db` is stale/0 bytes) `bun run test` fails with `no such table: …` on ~95 tests. `scripts/test.sh` sets `NEXT_PUBLIC_LOCAL_DB` / `LOCAL_SQLITE_URL`, `rm`s and re-pushes the schema, runs the suite, then cleans up. `scripts/test.sh db` runs only `src/db`.
- **TS errors in build are silenced** (`ignoreBuildErrors: true` in `next.config.js`). Always run `tsc --noEmit` separately to catch them.

---

## 10. External Dependency: nnsightful

`nnsightful` is a sibling library used by **both** the Python backend and the TypeScript frontend. It is **not on PyPI/npm registries** — it lives in a separate git repo (`AdamBelfki3/nnsightful`) and is consumed two ways:

### What it provides

`nnsightful` is the **interpretability tooling layer** the workbench is built on. It owns:
- **Tools** — Python implementations of the actual interpretability experiments (`logit_lens`, `j_lens`, `activation_patching`). Each tool has a `_run(...)` (executes against an nnsight model) and a `to_data_obj(...)` (shapes the result into a typed payload).
- **Type schemas** — Pydantic + TypeScript types describing tool inputs/outputs (`LogitLensData`, `ActivationPatchingData`, `LogitLensUIState`, `ActivationPatchingMode`).
- **React widgets** — `LogitLensWidget` (also used for j-lens), `ActivationPatchingWidget` that render those data objects.
- **Standalone visualization JS** — `viz/charts.js` for offline notebook rendering.

The contract between workbench and nnsightful is: **workbench wires tools to UI; nnsightful owns the experiments and the visualizations.**

### Where it's installed

- **Python**: declared in `pyproject.toml` as a git source pinned to a commit: `nnsightful @ git+https://github.com/AdamBelfki3/nnsightful.git@<sha>`. Installed by `uv sync`.
- **TypeScript**: declared in `workbench/_web/package.json` as `"nnsightful": "github:AdamBelfki3/nnsightful#<sha>"` (same commit). For local development, `scripts/web.sh --local` replaces the install with a symlink to a clone next to the repo root (`../../../nnsightful` from `_web/`). The expected layout:
  ```
  work/
  ├── workbench/
  └── nnsightful/
  ```
- `next.config.js` has `transpilePackages: ["nnsightful", "edulogitlens"]` and a Turbopack `root` set to the repo's parent dir so the symlink resolves during dev.

### Where it's used in the codebase

**Backend** (`workbench/_api/`):
- `routes/__init__.py` registers nnsightful with NDIF: `from nnsight import ndif; import nnsightful; ndif.register(nnsightful)` — this lets NDIF's remote backend serialize+execute nnsightful tools.
- `routes/logit_lens.py` imports `from nnsightful.tools.logit_lens import logit_lens`. The `/logit_lens/run` endpoint hands the tool call to `ToolEventStream` (`workbench/_api/sse.py`), which runs it with `ExecMode.REMOTE_ASYNC` in remote mode and streams the result.
- `routes/j_lens.py`, `routes/activation_patching.py` and `routes/chat.py` (`nnsightful.tools.generate`) mirror the same pattern. `routes/models.py` also calls `j_lens.get_available_lenses()` to flag each model's `has_jacobian` (j-lens support).

**Frontend** (`workbench/_web/src/`):
- `app/(shell)/logit-lens/[chartId]/components/LogitLensDisplay.tsx` — `import { LogitLensWidget } from "nnsightful"; import type { LogitLensData } from "nnsightful";` and renders the widget directly with `chart.data`.
- `app/(shell)/j-lens/[chartId]/components/JLensDisplay.tsx` — same `LogitLensWidget`, fed j-lens data.
- `app/(shell)/activation-patching/[chartId]/components/ActivationPatchingDisplay.tsx` — same with `ActivationPatchingWidget`, `ActivationPatchingMode`.
- `types/logitLens.ts` holds the workbench-side `LogitLensConfigData`; logit-lens data and UI state use nnsightful's own `LogitLensData` / `LogitLensUIState`, imported from `nnsightful` directly.
- `actions/notebook.ts` reads `node_modules/nnsightful/src/nnsightful/viz/charts.js` and inlines it into exported `.ipynb` files; the HTML embedding mirrors `nnsightful.viz._widget_html()` defaults (`DEFAULT_WIDTH = "90%"`, per-tool aspect ratios).
- `notebook-templates/activation-patching.ipynb` instructs users to `pip install git+https://github.com/AdamBelfki3/nnsightful.git` and `from nnsightful import activation_patching`.

### Workbench's wrappers around nnsightful

- **Backend**: each tool route is a thin FastAPI shim that handles auth (`require_user_email`) and state injection (`Depends(get_state)`), then returns `ToolEventStream(tool, model, *args, remote=state.remote, **kwargs).response()` (`workbench/_api/sse.py`). The response is a stream of Server-Sent Events:
  ```
  status  an NDIF status update (nnsight's ResponseModel without `data`)
  data    the tool's data; ends the stream
  error   {"error": "...", "type": "<Python exception class>"}; ends the stream
  ```
  When `state.remote=True` the tool runs with `ExecMode.REMOTE_ASYNC`, and each update of its `AsyncToolBackend` becomes a `status` event; a `: keepalive` comment goes out every 15 s while waiting so proxies don't close the connection. A local run is a single `data` event. Once streaming, failures are `error` events, not HTTP statuses.
- **Frontend**: `lib/runAndStream.ts` POSTs, parses the event stream, mirrors `status` into `useWorkspace.jobStatus` (the job badge in the header's model pill, `ModelControl.tsx`), and resolves with the `data` payload as a single `Promise<T>`. `lib/api/*.ts` wraps it per tool. Components consume the resulting `data` directly via the nnsightful widget.

### Assumptions the UI makes about nnsightful responses

1. **One streamed request per run.** The status updates and the result arrive over a single connection that lives as long as the run; a reload loses a run in progress (there is no job id to rejoin). The stream carries status, not partial results — don't add a "streaming results" label/UI.
2. **Result shape is dictated by `to_data_obj(...)`.** `LogitLensData` and `ActivationPatchingData` are the contract. Don't hand-massage these in workbench code; if the shape needs to change, it changes in nnsightful first and workbench updates its imports.
3. **Errors arrive as `error` events.** An NDIF `ERROR` status, a failed submit, or a tool error becomes an `error` event, and `runAndStream` throws an `NDIFJobError` carrying the Python exception (from the failed status's traceback, or the event's message and `type`) and the job id — error UX flows from there (toast via `runErrorMessage` + inline). Only failures before the stream opens (e.g. an unknown model) are HTTP errors, thrown as plain `Error`s.
4. **Widgets are self-contained.** `LogitLensWidget` and `ActivationPatchingWidget` render their full UI given `data` and a small UI-state prop. Workbench supplies theme via `next-themes` (`useTheme().resolvedTheme`) and lets the widget handle internal interactions.
5. **viz/charts.js path is stable.** `actions/notebook.ts` reads `node_modules/nnsightful/src/nnsightful/viz/charts.js` directly. If nnsightful restructures its viz folder, this path needs updating in `notebook.ts` AND in `next.config.js`'s `outputFileTracingIncludes`.

### When nnsightful or nnsight changes

To bump either dependency, use the **`update-nnsight-deps` skill** (`.claude/skills/update-nnsight-deps/SKILL.md`). It runs the right uv/bun commands, refreshes both lockfiles, and points at the most likely break sites.

Manual recipe summary (skill has the full version):

- **nnsight** (PyPI, Python only): `uv lock --upgrade-package nnsight && uv sync`
- **nnsightful** (git, both langs): `uv lock --upgrade-package nnsightful` and (inside `workbench/_web`) `bun update nnsightful`, then `uv sync` from the repo root. Both manifests pin a commit (`@<sha>` / `#<sha>`), so move the pin first.
- Verify with `bunx tsc --noEmit` in `workbench/_web/`. Do **not** run `next build` while the dev server is up.
- Most likely break sites after a nnsightful bump: `_api/routes/{logit_lens,j_lens,activation_patching}.py` and `_web/src/app/(shell)/{logit-lens,j-lens,activation-patching}/[chartId]/components/*.tsx`.

---

## Architecture summary

1. **The backend is a thin shim**, not a workhorse. It auths, telemeters, orchestrates NDIF jobs, and maps requests to nnsightful tools. The actual interpretability code lives in nnsightful; the actual model execution lives in NDIF (or local nnsight when `REMOTE=false`).
2. **Persistence is fully on the frontend's DB layer.** Backend has no DB. Charts/configs/documents/workspaces all flow through Drizzle → Supabase or local SQLite. This is why durable history (`lens_runs`, `tutorial_events`) lives in the frontend DB, not the backend.
3. **Two-DB setup is real and tested.** Schemas are mirrored across `schema.pg.ts` and `schema.sqlite.ts`; `bun:test` exercises the SQLite path. New tables must be added to both files.
4. **nnsightful is the load-bearing dependency** for both visualization (frontend widgets) and experiments (backend tools). It's git-installed, locally symlinked, and transpiled. Breaks here will surface as cryptic build/runtime errors.
5. **NDIF is the model-execution backplane.** The nnsightful tools stream each run (`sse.py`, `runAndStream.ts`). Only causal mediation still goes start→poll→results (`startAndPoll.ts`), and cold-model warmup polls the NDIF job behind `/models/start-generate` (`deployApi.ts`).
6. **shadcn primitives + a clear panel-header pattern carry the design language.** New UI that copies the panel pattern, reuses primitives, and respects the few hard rules in §4 will look native. New UI that doesn't will look like a separate product.
7. **Auth is Supabase cookies refreshed by middleware**, with `NEXT_PUBLIC_DISABLE_AUTH=true` short-circuiting both client and server to a stub user. The same pattern (`X-User-Email` header) propagates identity to the FastAPI backend.

## Areas this doc may need updating

- **Migration folders** (`pg-migrations/`, `sqlite-migrations/`): gitignored, so there is no committed migration history. If they get committed, document where to find it and how to reset.
- **Chart export** (`ChartExportMenu`, in the chart's page header beside its actions menu, once it has a result): every chart nnsightful draws (logit lens, j-lens, activation patching) exports as a PNG, snapshotted from its saved view in the current theme without the layer navigator; only activation patching exports a notebook today (`notebook-templates/activation-patching.ipynb`); `actions/notebook.ts` could justify a sub-section if more tools acquire export support.
- **Modal deployment**: `modal/` (`image.py`, `gpu_image.py`) and `make modal` aren't documented here; document them if they become a hot path for contributors.
- **Backend telemetry**: InfluxDB telemetry in `_api/telemetry.py` is currently off (`TelemetryClient.init` is commented out in `state.py`, so `log_request` is a no-op); document it if it's re-enabled. Frontend analytics and error tracking are PostHog (§7).
