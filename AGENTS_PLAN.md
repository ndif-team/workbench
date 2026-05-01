# Workshop features — agent build plan

Coordination doc for farming the work in `workbench-features-spec-2026-04-30.md` out to subagents. **Every agent must read this file plus the spec before starting.** Curated example content lives in `workshop-curated-examples-2026-04-30.md`.

## Scope

Three features. **Feature C (Prompt Influence Tracing) is deferred to Phase 2 — do not implement.** Phase 1 ships A + B + Workshop Mode infra.

| Feature | Wave | Status |
|---|---|---|
| A — Branching Generations | 2 (backend), 3 (UI) | shipped (Phase 1) |
| B — Commitment-Strip Logit Lens | 2 (backend), 3 (UI) | shipped (Phase 1) |
| C — Prompt Influence Tracing | DEFERRED | Phase 2 (schema only) |
| Workshop Mode infra | 0–1 | shipped (Phase 1) |
| Pre-cache + integration | 4 | shipped (Phase 1, synthetic + real-mode helper) |
| Polish + dry-run | 5 | shipped (Phase 1) |

**Phase 1 build complete (2026-05-01).** All 8 packages landed in a single
session. Backend pytest 15/15 pass; bun unit tests 46/46 pass; Playwright E2E
specs added (run in CI). Real-NDIF verification of curated examples is the
next pre-pilot step — see `WORKSHOP_DRY_RUN.md`.

## Confirmed decisions (2026-05-01, from Jon)

- **Target model:** Llama-3 8B.
- **Workshop URL:** sibling route to `lens2/` / `activation-patching/` / `overview/` (NOT a sub-mode of Education tab). Use `app/workshop/[exampleId]/`.
- **Auth:** out of scope for this work. Anonymous session-id cookie is fine for annotation persistence.
- **Curated examples:** 18 examples in `workshop-curated-examples-2026-04-30.md`. Pre-cache work uses these.
- **Tokens:** `HF_TOKEN` and `NDIF_TOKEN` live in `/home/researcher/workbench/.env` (gitignored). Read from env, never hardcode.

## Architecture context

- **Backend:** Python FastAPI under `workbench/_api/`. Existing routes: `lens.py`, `logit_lens.py`, `activation_patching.py`, `models.py`, `patch.py`. Add `branching.py` and `commitment_strip.py` following the same shape.
- **Frontend:** Next.js under `workbench/_web/`. Existing pages: `app/workbench/[workspaceId]/{lens2,activation-patching,overview}/`. Add `app/workshop/[exampleId]/` as the new sibling route. Add researcher-mode UIs as new sub-routes under `[workspaceId]/`.
- **DB:** Drizzle ORM (`workbench/_web/src/db/`). New table for workshop annotations.
- **E2E:** Playwright under `workbench/_web/tests/` — real NDIF, no mocks. Pattern in `tests/fixtures.ts` and `tests/logit-lens.spec.ts`.
- **INIF:** the on-disk record format Workbench uses for cached payloads. Existing record types are in the codebase; extend rather than fork.

## Wave structure

Wave N depends on N–1 unless otherwise noted. Within a wave, packages run in parallel.

### Wave 0 — Foundations (1 agent, opus, ~1 day)

**Pkg 0.1 — Schema + loader + annotation table**

Goal: unblock all downstream work by extending the data layer once.

Touch:
- `workbench/_api/data_models.py` — add three new INIF record types: `branching_generation_set`, `commitment_strip`, `prompt_influence` (define the third even though Feature C is deferred — schema-only, no runtime use). Fields per spec §1.4 / §2.4 / §3.4.
- `workbench/_api/routes/` — new `examples.py` with `GET /examples/{example_id}` that loads pre-cached payloads from a fixtures dir (path: `workbench/_api/_workshop_examples/`). On-disk now; S3 wiring later.
- `workbench/_web/src/db/` — new Drizzle migration adding `workshop_annotations(id, session_id, participant_id, example_id, annotation_text, framing_response, created_at)`. Drop `participant_id` from required-NOT-NULL since auth is anonymous.
- `workbench/_web/src/actions/` — server actions `saveWorkshopAnnotation` and `getWorkshopAnnotations(sessionId)`.

Deliverables:
- pytest unit test for the loader endpoint (round-trip a fixture)
- vitest integration test for annotation save/fetch via server action
- one fixture INIF file under `_workshop_examples/` per record type (so downstream waves have something to import against)

Acceptance: `bun run test` and `pytest workbench/_api/` both pass; `GET /examples/test-fixture-branching` returns the fixture payload.

---

### Wave 1 — Workshop Mode shell (1 agent, sonnet, ~2 days; depends on 0.1)

**Pkg 1.1 — Workshop Mode UI + reusable components**

Goal: ship the locked-down participant route and reusable workshop chrome.

Touch:
- `workbench/_web/src/app/workshop/[exampleId]/page.tsx` — new route. Loads pre-cached payload via the loader from 0.1.
- `workbench/_web/src/app/workshop/components/` — new dir.
  - `<TaskHeader />` — "Task N of 3" + progress dots
  - `<CriticalFramingPrompt />` — hidden until participant clicks "I see it"; 1–3 sentence text response with 10-char soft minimum
  - `<AnnotationPane />` — 1–2 sentence persistent textarea, debounced save via 0.1 server action
  - `<BranchingIndicator />` — small upper-right widget (mini-tree, click returns to branching view); persistent across tasks; dismissible per spec §5 item 3
  - `<SessionSummaryExport />` — markdown + auto-PDF export per spec §0.1, §5 item 6
- `workbench/_web/src/lib/workshop-session.ts` — anonymous session-id cookie + helper for fetching annotations

Out of scope: actual feature visualizations (those land in Wave 3 and get plugged in here).

Deliverables:
- new Playwright spec `workbench/_web/tests/workshop-mode.spec.ts`:
  - happy-path nav across 3 task placeholders
  - annotation persists across page reload (same session cookie)
  - critical-framing prompt appears only after "I see it" click
  - summary export downloads non-empty markdown

Acceptance: spec passes against the dev server; Argos screenshots baseline.

---

### Wave 2 — Backends (2 agents, opus, parallel, ~3 days; depend on 0.1)

**Pkg 2.1 — Feature A backend** *(opus)*

Goal: multi-sample generation + branched continuation endpoints with KV-cache resumption.

Touch:
- `workbench/_api/routes/branching.py` — new module:
  - `POST /branching/generate` — body: `{prompt, model, samples: [{temperature, seed}], max_tokens, top_k}`; response: list of completions, each with per-position top-K logits.
  - `POST /branching/continue` — body: `{prompt, model, prefix_tokens, forced_next_token, max_tokens}`; response: continuation completion + per-position top-K logits. Must reuse KV state up to branch point.
- `workbench/_api/main.py` — register router.
- Wire NDIF calls per existing patterns in `lens.py` / `logit_lens.py`. Use `NDIF_TOKEN` env var.

Latency targets (spec §1.4): ≤15s for N=3 on Llama-3 8B max_tokens=200; ≤5s for 200-token alternate.

Deliverables:
- pytest in `workbench/_api/tests/test_branching.py` — exercise both endpoints against real NDIF; assert top-K shape and that forced-token branching diverges from canonical
- script `scripts/precache_branching_demo.py` that produces the workshop demo's pre-cached payload (3 samples for the spec §1.1 demo prompt, plus drill-down branches for 2 chosen positions)

Acceptance: pytest passes; pre-cache script writes a valid INIF to `_workshop_examples/branching_demo.inif`.

---

**Pkg 2.2 — Feature B backend** *(opus)*

Goal: sequence-wide logit lens endpoint.

Touch:
- `workbench/_api/routes/commitment_strip.py` — new module:
  - `POST /logit-lens/sequence` — body: `{prompt, completion, model, top_k}`; response: for each token position, array of `(layer, top_k_logits)`. Shape ~ `seq_len × num_layers × K`.
- `workbench/_api/main.py` — register router.
- Reuse logit-lens internals from `logit_lens.py` where possible — this is "logit lens, batched across positions and layers."

Note: commitment-layer computation (top-1 / top-3 / p>0.5) is **frontend** so toggling doesn't roundtrip — backend just returns the per-layer top-K matrix.

Deliverables:
- pytest in `workbench/_api/tests/test_commitment_strip.py` — assert shape `seq_len × num_layers × K`; assert consistency with single-token logit lens at picked positions
- script `scripts/precache_commitment_strips.py` — produces commitment-strip payloads for the 6 Task 1 logit-lens examples in `workshop-curated-examples-2026-04-30.md`

Acceptance: pytest passes; pre-cache script writes 6 valid INIFs to `_workshop_examples/commitment_strip_*.inif`.

---

### Wave 3 — Feature UIs (2 agents, sonnet, parallel, ~3 days; 3.1 ⇐ 2.1+1.1, 3.2 ⇐ 2.2+1.1)

**Pkg 3.1 — Branching Generations UI**

Goal: side-by-side comparison + drill-down + Branching Indicator integration.

Touch:
- Researcher route `workbench/_web/src/app/workbench/[workspaceId]/branching/[chartId]/page.tsx`.
- Workshop hook: when `app/workshop/[exampleId]/` loads a `branching_generation_set` payload, embed the same comparison component (locked controls).
- Components under `workbench/_web/src/components/branching/`:
  - `<TrajectoryComparison />` — N panels with synchronized streaming and divergence highlighting (color saturation ∝ KL divergence at position; computed client-side from per-position top-K)
  - `<BranchDrillDown />` — modal/right-panel showing chosen token + top-5 alternatives + 10-token greedy previews
  - Wire `<BranchingIndicator />` (from 1.1) into the workshop demo
- `workbench/_web/src/lib/api/branching.ts` — typed client for the 2.1 endpoints.

Edge cases per spec §1.6 (all-identical samples, drill-down at >0.99 token, etc.).

Deliverables:
- new Playwright spec `workbench/_web/tests/branching.spec.ts`:
  - generate 3 samples on real NDIF, see side-by-side render
  - click a divergent token → drill-down opens with top-5 in <500ms (cache hit)
  - click "Generate full alternate trajectory" → new panel slides in with full alternate workshop
  - workshop-mode path: `/workshop/branching-demo` loads pre-cached payload, no live NDIF call observed
- Argos screenshots of side-by-side and drill-down

Acceptance: spec passes; manual smoke against `bun run dev`.

---

**Pkg 3.2 — Commitment-Strip overlay**

Goal: heat-strip extension on existing Logit Lens panel.

Touch:
- Existing logit-lens panel at `workbench/_web/src/app/workbench/[workspaceId]/lens2/[chartId]/` — add a "Show commitment-strip" toggle.
- Components under `workbench/_web/src/components/commitment-strip/`:
  - `<HeatStrip />` — inline-rendered tokens with per-token bg color + legend; toggle for top-1 / top-3 / p>0.5 (re-color client-side, no refetch)
  - Hover tooltip: commitment layer + final-layer probability
  - Click-through: open existing logit-lens single-token drill-down
- `workbench/_web/src/lib/commitment-layer.ts` — pure-function module to compute commitment layer per token from per-layer top-K (3 definitions).
- Workshop hook: when `app/workshop/[exampleId]/` loads a `commitment_strip` payload after Task 1, render the strip with the curated example's completion.

Deliverables:
- new Playwright spec `workbench/_web/tests/commitment-strip.spec.ts`:
  - render strip on real-NDIF completion
  - toggle definition (top-1 → top-3 → p>0.5) without refetch (assert no new network call)
  - click "late" token → existing logit-lens drill-down opens
- Argos screenshots of heat-strip with each definition

Acceptance: spec passes; toggle is visibly instant; click-through reuses existing drill-down component.

---

### Wave 4 — Workshop integration (1 agent, sonnet, ~2 days; depends on 3.1+3.2+1.1)

**Pkg 4.1 — Pre-cache curated examples + wire into Workshop Mode**

Goal: every relevant curated example has a pre-cached payload; Workshop Mode loads them instantly.

Touch:
- `scripts/precache_workshop_payloads.py` — top-level script that runs all per-example pre-cache helpers:
  - Task 1 (logit lens) examples — needs commitment-strip payloads (6) + single-token logit-lens payloads
  - Task 2 (activation patching) examples — needs patching pre-cache (6)
  - Task 3 (PatchScope) examples — needs PatchScope pre-cache (6)
  - Branching demo — already covered in 2.1 deliverable
- `workbench/_api/_workshop_examples/manifest.json` — list of all example IDs and which payload types each provides.
- Wire 18 examples into Workshop Mode navigation: per-task example picker.
- Verify: Workshop Mode path produces zero live NDIF traffic for participant clicks.

Deliverables:
- regenerated example fixtures committed under `_workshop_examples/`
- new Playwright spec `workbench/_web/tests/workshop-flow.spec.ts`:
  - walk Tasks 1→2→3 in a single session
  - assert no `ndif.us` network calls (use Playwright route interception to fail-on-call)
  - assert annotations + framing responses persist across all 3 tasks

Acceptance: full 3-task workshop run takes <5s of live network time per task; pre-cache script idempotent.

---

### Wave 5 — Polish + dry-run (1 agent, opus, ~2 days; depends on 4.1)

**Pkg 5.1 — Latency, edges, screenshots**

Goal: workshop-ready quality.

Touch:
- Edge cases from spec §1.6 / §2.6: all-N-identical handling, very-short-completion legend hiding, never-commits "unsettled" gray, drill-down on >0.99-prob tokens.
- Argos screenshot baselines for all new specs.
- Latency: profile Workshop Mode cold load; aim for <1s on cached payloads.
- Workshop Mode end-to-end on 3 curated examples — facilitator dry-run script.

Deliverables:
- a `WORKSHOP_DRY_RUN.md` checklist (terse, one-page) for Adam to run pre-pilot
- any fixes that came out of the edge-case sweep

Acceptance: full workshop dry-run runs end-to-end under 60 min on local dev.

---

## Standard agent brief template

Every agent gets a prompt of this shape:

```
Read /home/researcher/workbench/AGENTS_PLAN.md for the full coordination context, and the relevant spec sections from /home/researcher/workbench/workbench-features-spec-2026-04-30.md. You are working on Pkg X.Y.

Goal: <one sentence>
Touch: <files>
Deliverables: <list>
Acceptance: <criteria>

Do not implement anything outside Pkg X.Y. If you discover the spec conflicts with shipped reality, stop and report — do not improvise scope. Follow existing code patterns (lens.py for backend routes, logit-lens.spec.ts for tests). Use HF_TOKEN and NDIF_TOKEN from /home/researcher/workbench/.env. Do not commit secrets.

Tests must pass before you mark the task complete.
```

## Out of scope

- Feature C (Phase 2)
- Auth (separate Gwen-owned spec)
- Researcher-only affordances beyond what workshop support requires (saving/sharing/comparing across runs)
- Detailed visual design (Gwen's call)
- S3 wiring (on-disk fixtures dir is the Phase-1 substitute)
