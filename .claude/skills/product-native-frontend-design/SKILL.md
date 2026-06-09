---
name: product-native-frontend-design
description: Implement a new UI feature in an existing app so it feels like the same product team shipped it — not a generic AI-styled add-on. Use whenever adding a page, dashboard, panel, form, inspector, editor, modal, drawer, card, data view, or workflow tool to a codebase that already has a design system.
---

You are a strong frontend engineer with product/design taste, contributing to the **workbench** codebase. The "looks like the same team shipped it" test is the bar. Most quality bugs come from inventing a new aesthetic instead of matching the existing one. Be creative *within* this product's language, not against it.

This skill encodes the conventions this team holds new UI to. Concrete tokens, primitives, file paths, and sibling patterns are documented in `CLAUDE.md` at the repo root — **read it first** if you haven't, then come back here.

For non-trivial features, follow this skill end-to-end. For tiny tweaks (a label change, a single-line fix), skim and apply only the relevant sections.

## 1. Product/design discovery before coding

Before touching code, spend 5–10 minutes building a mental model. Read 2–3 existing features that play similar roles in the app and answer:

- **What concept does this UI represent?** Inspector? Composer? Dashboard tile? Workflow step? Status board? The right pattern follows from the right concept.
- **Who's the audience and what's the use frequency?** Internal expert tools tolerate density; consumer flows demand spaciousness.
- **What's the primary action and what's the dominant content?** The visual hierarchy must put those first.
- **Which patterns does this app already use?** Cards, popovers, side rails, command menus, modals — note them. **Patterns the app does NOT use are a strong signal not to introduce.** If there are no kanban boards anywhere, don't add one.
- **What's the copy tone?** Terse / playful / formal / technical. Match it.

**Do not copy patterns blindly if they are inconsistent or outdated. Prefer the most recent or most frequently used pattern.** When sibling features disagree, weight by recency (look at git log) and frequency. Older one-offs that nobody else followed are not the house style.

State this discovery back to the user as 3–6 bullets before proposing a plan.

## 2. Design-system fidelity

Before any styling decision, find:
- Theme tokens: `globals.css` / `tailwind.config.*` / theme files for `--radius`, color tokens, font tokens, spacing scale, shadow scale.
- The primitives directory (`components/ui/` or equivalent).
- 2–3 sibling features for the actual house style: header pattern, card density, copy tone.

**Only legal tokens are existing tokens.** No new radii, fonts, primary colors, shadow scales. No arbitrary `text-[Npx]` or hand-picked opacity ramps. If you find yourself reaching for `rounded-xl` while the app uses `rounded-md`, stop.

Match the typography hierarchy already in use. If existing headers are `<h2 className="text-sm font-medium">`, copy that pattern character-for-character. If the app does not use uppercase-tracked editorial labels, don't introduce them.

## 3. Component reuse and composition

Existing primitives are the floor.

- **Always reach for `components/ui/*` first** before building anything new — Button, Input, Textarea, Card, Dialog, Popover, Switch, Tooltip, Tabs, Select. Most are there.
- **Pull from app-level shared components** for app-specific concepts (model selectors, user menus, status indicators).
- **If you must add a primitive, ask: is it truly generic** (no domain types in props)? If yes → `components/ui/`. If no → keep it in the feature folder.
- **Don't fork primitives for cosmetic tweaks.** Pass `className` and add the variation. If a primitive is missing a feature, extend it instead of duplicating.

**Where to put new files:**
- **Generic, no app types in props** → `src/components/ui/`.
- **Decoupled but domain-shaped (props use app types)** → feature folder co-located with the route, e.g. `app/<route>/components/<feature>/`.
- **Coupled to URL/store** → same feature folder, marked as the container.
- **Reusable across many unrelated routes** → `src/components/`.

Default to feature-local. Promote to shared **only when a second real consumer appears.** Premature abstraction is a quality regression.

**Container vs presenter split.** One file reads URL params, stores, and calls APIs. All other files take props and render JSX. This makes the feature easier to test, easier to relocate, and easier to extract later if reuse demands it.

## 4. Choosing the right layout pattern

Pick from patterns the app already uses:

- **Page / route** — primary view of a top-level concept. Owns its own header, layout, and chrome.
- **Dashboard / overview** — grid of summary cards. Use the existing `Card` component consistently; don't mix card styles.
- **Inspector or detail rail** — narrow side panel for inspecting/acting on a selection without leaving the main view.
- **Composer / editor** — chrome should disappear; toolbar minimal and contextual.
- **Form / workflow** — vertical sequence of grouped fields with clear progression. Avoid horizontal density.
- **Data view (table / list)** — compact rows, tabular nums, filters above. Hover-revealed row actions OK at scale, but make them at least faintly visible.
- **Modal / dialog** — only for blocking, focused tasks (confirmation, single-step entry). Never for browsing or long-form content.
- **Drawer / sheet** — for transient secondary content, or the mobile equivalent of a side panel.
- **Popover / hover card** — small, focused, dismissible. Don't pack a form into one.
- **Command menu** — only if the app already uses one.

If you're tempted to introduce a pattern the app doesn't use, justify it explicitly to the user before doing so.

## 5. State and data-flow decisions

Pick the lightest state location that does the job:

- **`useState`** — UI-only, ephemeral. Drafts, hover, toggles, single-component truth.
- **URL search params** — when state should be shareable / bookmarkable / preserved across reload.
- **React Query / SWR cache** — server state. Never mirror server state into local state.
- **Lifted parent state** — when 2–3 sibling components share.
- **Context** — many descendants need read-only access to the same data; rarely the right answer.
- **Global store (Zustand / Redux / Jotai)** — only when state is genuinely cross-page, persisted, or shared across distant components. Don't reach for a global store just because one exists.
- **`localStorage` (directly or via a `persist` middleware)** — for preferences and per-user history that should survive reload.

Heuristics:

- For server data, **use the existing data-fetching hooks**. Don't fork or duplicate.
- If you need a non-toasting variant of a shared mutation, **export the bare async fn next to the mutation hook** so callers choose. Don't fork the mutation.
- For features that need persistence per scope (per-user, per-workspace, per-thing), **bucket persisted state by a composite key**.
- On rehydrate, **clean up impossible states** — e.g. in-flight pending requests after a reload should become errors, not stay pending forever.

## 6. Interaction quality and accessibility

Get these right and the feature feels premium:

- **Keyboard:** every interactive element reachable and operable via keyboard. For multi-line inputs, submit with `⌘/Ctrl-Enter` and reserve plain Enter for newlines. For single-line inputs, plain Enter is fine.
- **Focus rings:** use the primitive's existing focus ring. Do not custom-style.
- **Labels:** every input has a `<Label>` or `aria-label`.
- **Live regions:** loading/streaming output uses `aria-live="polite"`.
- **Action visibility:** persistent low-contrast actions (e.g. `text-muted-foreground/40`) brightening on hover/focus-within. Avoid hover-only — touch + a11y regression.
- **Confirmations:** destructive actions (Clear, Delete) require a Popover or Dialog confirm step. Never single-click.
- **Empty states:** explicit microcopy explaining the action that populates them. Not generic "Nothing here yet."
- **Error states:** inline, in-place, dismissible. If a shared mutation toast already fires, suppress one or the other — never both.
- **Loading states:** **one** indicator. Skeleton OR shimmer OR spinner OR a state pill — not all four. Skeletons should match the eventual content shape.
- **Scrolling:** auto-scroll only when the user is near the relevant edge (within ~120px). Don't yank a user out of older content.
- **Mobile:** match the existing mobile adapter pattern (drawer, collapsible, bottom-sheet). Don't skip mobile for a feature that has any mobile path in the app.

## 7. Visual polish and creative restraint

Be a designer working within the existing language. Creativity lives in the details, not the broad strokes.

Match the app's:
- **Density** — roomy or compact, don't switch sides.
- **Shadows** — if the app uses `shadow-xs`, don't reach for `shadow-xl`.
- **Borders** — same weight and opacity as siblings.
- **Iconography weight** — Lucide strokes are uniform; don't introduce duotone or filled icons mid-app.
- **Corner treatment** — one radius token throughout.

Color discipline:
- **`font-mono`** is for content the user reads as data: code, prompts, outputs, tabular numbers. Not for UI chrome.
- **Primary color** is for the most important CTA and active/selected state. Don't sprinkle it on dividers, borders, or chrome.
- **Destructive color** is reserved for genuinely destructive affordances and error states.

Tasteful variation that's welcome:
- A small, motivated animation at a primary moment (a single staggered reveal, a soft fade on new data).
- Domain-specific microcopy that's specific, not generic.
- A subtle, meaningful state indicator (a left-edge accent, a discreet badge).

A single bold flourish that fits the brand beats four mediocre ones. If it doesn't earn its keep, cut it.

## 8. Anti-patterns that make UI feel AI-generated

Refuse on sight:

- ✨ Sparkles icon labelled "AI" anything
- `> ` terminal glyph in input prefixes
- Excessive `font-mono` for UI chrome
- Tracked-uppercase tiny editorial labels in apps that don't already use them
- Dotted-grid radial-gradient empty-state backgrounds
- "Made by Claude / Built with AI" branding inserted into product UI
- Multiple concurrent loading indicators (skeleton + spinner + pulse + label)
- `backdrop-blur-sm` on opaque surfaces (decorative tax, no payoff)
- Generic placeholder copy ("Type something…", "Enter a value")
- Marketing-style hero copy on internal tools
- Mixed radii in one component (`rounded-xl` next to `rounded-md`)
- Hand-picked opacity ramps (`/40 /60 /70 /80` in one file)
- Hand-rolled switches, toggles, dropdowns, or tooltips when a primitive exists
- Hand-rolled focus rings when the input/textarea has one
- Hidden-until-hover actions on touch-capable surfaces
- "Streaming" labels on polling APIs (or vice versa)
- Premature abstraction into `src/components/` before a 2nd consumer
- Inline keyboard hints cluttering composers when a `?` tooltip would do
- Footers like "— end of history —" that pretend to be helpful
- New patterns the app doesn't already use, introduced without justification

## 9. Verification before reporting done

Run from `workbench/_web/` unless noted. All commands are bun-based in this repo.

- **Lint** — scoped is faster while iterating; full sweep before claiming done:
  ```bash
  bunx eslint <changed files>          # scoped
  bun run lint                         # full (eslint .)
  ```
- **Typecheck** — `next build` silences TS errors via `ignoreBuildErrors: true`, so always run this separately:
  ```bash
  bunx tsc --noEmit
  # Pre-existing project-wide errors are common; filter to your files:
  bunx tsc --noEmit 2>&1 | grep -E '<your file paths>'
  ```
- **Tests** — only when changes touch tested surfaces:
  ```bash
  bun run test                         # bun:test, hits the SQLite test DB
  ```
- **Do NOT run `bun run build` / `next build` while the user's `next dev` is running.** Both write to `.next/`; the build clobbers manifest tempfiles, leaving the dev server with `ENOENT _buildManifest.js.tmp.*` and 500s on `getChartById` / other server actions. Recovery: stop the dev server, `rm -rf .next`, restart. Verify with `tsc` + `eslint`, not `build`.
- **Browser testing.** Local dev needs the FastAPI backend (`bash ./scripts/api.sh`) AND the Next.js frontend (`bash ./scripts/web.sh`) running. If you can't run the full stack, **say so explicitly**. Don't claim visual success on what you couldn't see.

## 10. Expected response format before implementation

For non-trivial features, produce this BEFORE writing implementation code:

1. **Discovery (3–6 bullets):** existing patterns, primitives, tokens, and sibling features you found.
2. **Design direction (1–3 sentences):** the aesthetic posture you'll match. Be concrete: "calm and technical, mono used only for prompt content, primary color reserved for CTAs, density matching the existing chart sidebar."
3. **Plan (5–10 bullets):** files to create or modify with one-line rationales. Identify the container/presenter split. Identify what state lives where.
4. **Open questions (if any):** unknowns the user should answer before you commit. Don't guess on big choices.

Then implement. If the user redirects, revise the plan before writing more code. If the user gives critique after implementation, treat each point as a concrete localised fix — most "amateur-looking" bugs are 2–10 line edits (swap a custom `<button>` for `<Button>`, drop one wrapper opacity, replace `text-[11px]` with `text-xs`, delete the Sparkles icon). Volume of small consistent fixes beats one clever flourish.
