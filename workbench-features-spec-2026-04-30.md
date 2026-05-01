# Workbench — Workshop-Supporting Features Spec

**Goal:** Bridge Workbench's single-token interpretability operations to participants' lived experience of long-form GenAI output.
**Three new features, ranked by priority:** **A — Branching Generations** (highest), **B — Commitment-Strip Logit Lens**, **C — Prompt Influence Tracing**.
**Companion docs:**
- Workshop outline: `faculty-staff-pilot-outline-2026-04-30.md`
- Curated examples library: `workshop-curated-examples-2026-04-30.md`

**Caveat:** Spec is written from outside the codebase. Some assumptions about existing Workbench architecture are inferred from the Apr 13–27 meeting notes (Education vs Workspace tab split, INIF format, anywidget feasibility, NDIF API). Adam should push back on anything that conflicts with what's actually shipped.

---

## 0. Cross-cutting requirements

These hold across all three features and **must be designed once, not three times.**

### 0.1 Workshop Mode (separate from researcher Education tab)

Faculty/staff in a 60-min workshop need a **locked-down UI**, not the full Education tab. Workshop Mode is a distinct UI state, accessed by a workshop URL or by a "Start Workshop" button.

**What Workshop Mode hides:**
- Prompt editing (curated examples are locked)
- Model/parameter selection (pre-set per example)
- Tab navigation across other Workbench features
- Save/export to researcher locations
- Anything that requires understanding NDIF/nnsight terminology

**What Workshop Mode shows:**
- Current task header (1 of 3) with progress dots
- Current example's pre-loaded state (Source / Target / Probe per example type)
- The relevant visualization (logit lens / patching / PatchScope output) — single panel, no surrounding chrome
- **Annotation pane** (1–2 sentence text field, persists per example)
- **Critical-framing prompt** that appears *after* the participant clicks "I see it" — never before (priming)
- "Next example" / "Skip this example" / "I'm done with this task" navigation
- A small persistent **Branching Indicator** (see Feature A.4) reminding the participant that the current view is one node in a larger tree

**What Workshop Mode produces at the end:**
- A session summary doc (markdown / PDF) per participant: which examples they engaged with, their annotations, the critical-framing prompts they answered, optional screenshots of key views. Auto-emailed to participant + study-team-blind-copy address.

### 0.2 Pre-cached example payloads

For workshop deployment, every curated example must have a **pre-computed payload** so the workshop UI loads instantly and never depends on live NDIF compute during a participant's session.

Payload schema per example (proposed INIF extension):
- `example_id` (unique)
- `example_type` ("logit_lens" | "activation_patching" | "patchscope" | "branching" | "commitment_strip" | "prompt_influence")
- `prompt(s)` — verbatim, plus model + temperature + seed
- `pre_computed_results` — full top-K-per-layer / patched activations / sample trajectories, etc. (per-feature schema below)
- `critical_framing_prompt` — short text
- `pedagogical_narrative` — short text shown only to facilitator
- `risk_flag` — string for facilitator's eyes

Storage: INIF files in a workshop-specific S3-or-equivalent bucket. Loading on participant click is a single GET.

### 0.3 Annotation persistence

Workshop Mode writes participant annotations to a session-scoped store (Postgres row keyed by `(session_id, participant_id, example_id)`). Used at end-of-session for the summary export and for IRB-bound study data analysis.

### 0.4 Critical-framing prompt component

A reusable React component:
- Shows after participant clicks "I see it" / "I'm done with this example"
- Displays the per-example `critical_framing_prompt` text
- Provides a 1–3 sentence text response field
- Saves response to annotation store
- Has "Next example" CTA when participant has typed at least 10 chars (soft requirement)

### 0.5 Education tab vs Workspace tab — feature placement

Per Adam's Apr 27 proposal: Education tab is for slowed-down comprehension; Workspace tab is for researcher experimentation. Recommended placement:

| Feature | Education tab | Workspace tab |
|---|---|---|
| A. Branching Generations | ★ (workshop opener) | ★ (researcher use too) |
| B. Commitment-Strip Logit Lens | ★ (extension of existing logit lens) | Optional toggle |
| C. Prompt Influence Tracing | ★ (workshop closer if shipped) | ★ (researcher use too) |
| Workshop Mode | Sub-mode of Education tab | (not present) |

---

## 1. Feature A — Branching Generations

**Pedagogical goal:** Make visible that "the AI's response" is one trajectory through a branching probability tree. Defeats the "AI gave the answer" frame and primes participants for the token-level operations in Tasks 1–3.

**Workshop role:** 5-minute facilitator demo at the opening of Movement 2, before the three single-token tasks. Persistent UI element (the Branching Indicator, A.4) remains visible throughout.

### 1.1 User flow — facilitator demo (workshop)

1. Facilitator opens Workshop Mode → "Branching Generations Demo" pre-loaded.
2. Pre-loaded prompt visible: "Design a 60-minute critical AI literacy workshop for university faculty using interactive interpretability tools."
3. Three pre-generated outputs render side-by-side in 3 panels (T=0.4, T=0.7, T=1.0). Tokens stream in synchronously across panels (replay from cache, ~10s replay).
4. As tokens stream, **divergence highlighting** kicks in: tokens that differ across panels at a given position get a colored border. Three trajectories that say identical first 80 tokens, then start to disagree, are visually obvious.
5. After streaming completes, the three panels remain side-by-side. Facilitator narrates: "Three workshops, same prompt. Where did they decide to be different?"
6. Facilitator clicks any divergence-highlighted token → **drill-down opens**.
7. Drill-down shows: the chosen token at the center, top-5 alternative tokens that *would* have been picked, each labeled with its probability. Clicking any alternative previews the next ~10 tokens that would have followed.
8. Facilitator can click "Generate full alternate trajectory" → a new panel appears with the full alternate workshop, generated from the alternative-token branch point.

### 1.2 User flow — researcher (Workspace tab)

Same as above but with prompt editing, model/temperature/seed/N-samples controls, INIF export, ability to save the branch tree as a research artifact.

### 1.3 UI components

**Generation panel (researcher) / pre-loaded panel (workshop):**
- Prompt text area (locked in Workshop Mode)
- Sample count (default 3, max 5)
- Temperature(s) — either three sliders or a "diversity" preset
- Max tokens (default 200)
- "Generate variations" button

**Side-by-side comparison (the centerpiece):**
- N panels, equal-width on desktop, vertical-stacked on mobile
- Header per panel: temperature label + a "this is the canonical sample" star (researcher mode)
- Synchronized streaming: tokens reveal in lockstep across panels via a shared playhead
- **Divergence highlighting:** tokens at positions where ≥1 panel differs from the position-wise plurality token get a colored border. Color saturation proportional to KL divergence at that position (light = small disagreement, dark = high disagreement).
- Hover any token → tooltip shows top-5 alternatives + their probabilities at this position
- Click any token → **drill-down opens**

**Drill-down view (modal or right-panel):**
- The chosen token at center, fixed
- Up to 5 alternative tokens radiating, each card showing:
  - Alternative token text
  - Its probability at this step
  - The next ~10 tokens that would follow (greedy continuation, also pre-cached)
- Click an alternative → "Generate full alternate trajectory" CTA
- Click that → a new comparison panel slides in alongside the original three, showing the full alternate workshop

**Branching Indicator (persistent, visible throughout workshop):**
- Small widget in upper-right corner of Workshop Mode
- Shows a stylized mini-tree with the current trajectory highlighted
- Reads: "You are looking at one branch of a tree of [3 / 5 / etc] possible outputs"
- Clicking the indicator returns to the Branching Generations view

### 1.4 NDIF / backend requirements

**Multi-sample generation endpoint:**
- Input: prompt, model, list-of-(temperature, seed) tuples, max_tokens, top_p
- Output: list of N completions, each with per-position top-K logits (K ≥ 5)
- Should batch the N forward passes if NDIF supports it; otherwise sequential
- Latency target: 15s for N=3 on Llama-3 8B at max_tokens=200

**Branched continuation endpoint:**
- Input: prompt, model, prefix-tokens (the chosen prefix up to the branch point), forced-next-token (the alternative the user selected), max_tokens
- Output: continuation completion + per-position top-K logits
- Optimization: cache the KV state up to the branch point so the alternate trajectory only computes from that point forward
- Latency target: 5s for 200-token alternate generation

**INIF schema extension:**
- New record type: `branching_generation_set`
- Stores: prompt, list of (temperature, seed, completion, per-position top-K logits) tuples
- Stores: optional drill-down branches (chosen position → alternative token → forced continuation)

### 1.5 Performance and caching

For workshop deployment: **everything is pre-cached.** The workshop facilitator's "Generate variations" button replays a pre-computed payload, not live compute. The researcher view does live NDIF calls.

For drill-down: the per-position top-K logits are already in the payload, so opening drill-down is instant. Generating an alternate full trajectory is the only live-compute step in the workshop demo, and it's ~5s on a single-trajectory KV-resumption call.

### 1.6 Edge cases & failure modes

- **All N generations identical** (low T, low diversity): show "all samples identical at this temperature; raise temperature to see variation." Don't render an empty side-by-side.
- **Prompt too long for context:** standard NDIF error surface.
- **NDIF down during researcher use:** show cached examples or graceful failure message.
- **Drill-down on a position where the chosen token had >0.99 probability:** show "no realistic alternatives at this position — the model was nearly certain." Suggest: try a different token.
- **Long completions (>500 tokens):** paginate the side-by-side; only stream visible region.

### 1.7 Implementation notes

Frontend lives in the existing React shared-component library that wraps the visualization layer. Reuses prompt input. New components: `<TrajectoryComparison />`, `<BranchDrillDown />`, `<BranchingIndicator />`. INIF reading already supports custom record types per Gwen's earlier work; extend the schema rather than introduce a new format.

### 1.8 Acceptance criteria

- Workshop facilitator can run the demo end-to-end in ≤5 min from cold load
- Drill-down reveals top-5 alternatives with previews in <500ms
- "Generate full alternate trajectory" returns a fully-rendered alternate workshop in <8s on Llama-3 8B
- Researcher can export the full branch tree as INIF
- Branching Indicator visible in Workshop Mode when participant is in any of Tasks 1–3

### 1.9 Risk & mitigations

- **Latency in drill-down feels sluggish.** Mitigation: pre-cache the workshop demo's branch points specifically; drill-down on those is instant.
- **Visualization overwhelm in side-by-side.** Mitigation: divergence highlighting is configurable; default to "show only major divergences."
- **Faculty don't intuit the tree from three side-by-side trajectories.** Mitigation: the Branching Indicator widget; the explicit "and these are just 3 of an exponential number of possible outputs" facilitator narration in the script.

---

## 2. Feature B — Commitment-Strip Logit Lens

**Pedagogical goal:** Show that not all generated tokens are equally "decided" — some are formulaic (decided in mid-layers), some are contested through to the final layer. Generalizes single-token logit lens to a sequence-level view.

**Workshop role:** Optional 2–3 min closer at the end of Movement 2, OR embedded within Task 1 (logit lens task) once the participant has done one example. Lower priority than A.

### 2.1 User flow — researcher

1. Generate a completion (or paste an existing one in the Logit Lens panel).
2. Toggle "Show commitment-strip" on the existing Logit Lens widget.
3. Output text re-renders as a heat-strip: each token has a colored background indicating the layer at which the chosen token first reached top-1 (or top-K, configurable).
4. Hover any token → tooltip shows commitment layer + chosen-token probability at the final layer.
5. Click any token → existing logit-lens single-token view opens (drill-down).

### 2.2 User flow — workshop participant

The participant has just finished Task 1 (single-token logit lens on a hallucination case). The Workshop Mode UI shows:

> "You just looked at one position. Now look at the whole completion: which tokens were 'easy' and which were 'contested'?"

Heat-strip renders for the same completion they were just inspecting. Hover a "contested" (red) token → "this one was decided very late, near the final layer." Click → opens the standard logit-lens view they already saw.

### 2.3 UI components

**Heat-strip view:**
- Generated text rendered inline with colored backgrounds per token
- Color scheme: continuous gradient from "early commitment" (blue, decided by layer 8) through "mid" (green, layer 16) to "late commitment" (red, layer 28+) and "unsettled" (gray, never cleanly committed)
- Legend visible: "First layer at which the chosen token reached top-1"
- Toggle: "top-1 commitment" / "top-3 commitment" / "p>0.5 commitment" — the three most useful definitions

**Token detail on hover/click:**
- Hover: tooltip with commitment layer + final probability
- Click: existing logit-lens panel for that token (already implemented)

### 2.4 NDIF / backend requirements

**Sequence-wide logit lens endpoint:**
- Input: prompt, completion (the generated tokens to analyze), model
- Output: for each token position, an array of (layer, top-K logits at that layer)
- This is `sequence_length × num_layers × K` of data. For 200 tokens × 32 layers × 5 = 32,000 entries. Manageable, cacheable.

**Commitment-layer computation (frontend or backend):**
- Given the per-layer top-K data, compute "commitment layer" per token using the chosen definition:
  - **top-1 commitment:** first layer at which the chosen token is top-1 and remains top-1 through final layer
  - **top-3 commitment:** first layer at which the chosen token is in top-3
  - **p>0.5 commitment:** first layer at which the chosen token's probability crosses 0.5
- Compute this once per token, cache.

### 2.5 Performance and caching

- Sequence-wide logit lens on a 200-token completion: ~5–10s on Llama-3 8B (mostly the per-layer projections)
- For workshop deployment: pre-compute and cache. Heat-strip renders instantly from cached data.
- Commitment-layer values themselves are cheap to recompute when the user toggles top-1 / top-3 / p>0.5 — do this in frontend, not via a roundtrip.

### 2.6 Edge cases

- Tokens that never commit (e.g., where the chosen token enters top-K only at the final layer): give a distinctive "unsettled" color, don't lie about the layer.
- Very short completions (< 20 tokens): heat-strip works but legend dominates; consider hiding the legend below 20 tokens.
- Commitment-layer definition is a real interpretability research choice — surface it explicitly so reviewers and faculty can see it's a definitional decision, not a fact about the model.

### 2.7 Implementation notes

This is the lightest of the three features. It's almost entirely a UI extension of existing logit lens — no new model intervention, just batched per-layer projection plus a coloring layer in the React component. Should ship in ~1–2 weeks of Adam-time after Feature A is in flight.

### 2.8 Acceptance criteria

- Heat-strip renders for a 200-token completion in <100ms (after data load)
- Toggling commitment definition (top-1 / top-3 / p>0.5) re-colors instantly without re-fetch
- Click-to-drill-down opens existing logit-lens panel for the chosen token
- Workshop Mode shows the heat-strip for participants in Task 1's "expanded view"

### 2.9 Risk & mitigations

- **The "commitment layer" framing implies more determinism than is true.** Mitigation: the legend says "first layer at which the chosen token reached top-1" — descriptive, not normative. Tooltip explains: "this is when this *output's* token won; with different sampling, the trajectory would have been different."
- **Faculty over-interpret heat-strip patterns.** Mitigation: the workshop facilitator narrates the framing; in self-paced viewing, the critical-framing prompt asks an open-ended question rather than implying a particular conclusion.

---

## 3. Feature C — Prompt Influence Tracing

**Pedagogical goal:** Show which words in the prompt are "responsible for" which parts of the output. Build intuition that prompts have *structured*, *localized* effects — not uniform influence.

**Workshop role:** Optional Movement 2 closer if shipped (3 min). **Lower priority than A and B.** Honest assessment: this is a research project disguised as a workshop feature; methods disagree, attribution is fragile, and it's likely too much for the May/June timeline. Recommend deferring to Phase 2.

### 3.1 User flow — researcher

1. Generate (or paste) a prompt + completion.
2. Toggle "Show prompt influence" on the Workspace tab.
3. Choose attribution method: "Attention rollup" (default, fast), "Integrated gradients" (slow, more reliable), "Attribution patching" (middle).
4. Click any output token → prompt tokens get colored backgrounds proportional to their attribution to the chosen output token.
5. Hover a prompt token → numerical attribution score.

### 3.2 User flow — workshop participant (only if shipped)

1. Workshop Mode pre-loads a prompt + output of interest (e.g., the curated hallucination case from Task 1, expanded to a longer paragraph completion).
2. Click an output token (e.g., the hallucinated wrong answer) → prompt tokens highlight with attribution.
3. Critical-framing prompt: "Which words in your prompt did most of the work for this part of the output? Would you have predicted that?"

### 3.3 UI components

**Output panel:**
- Generated text with per-token clickable regions
- A "Trace prompt influence" toggle visible per token

**Prompt panel:**
- When trace is active, prompt tokens get colored backgrounds (light → dark by attribution)
- Hovering a prompt token shows numerical score
- Method-selector dropdown surfaces interpretability complexity:
  - "Attention rollup" (fastest, qualitative)
  - "Integrated gradients" (slower, quantitative, reliable)
  - "Attribution patching" (middle, fast approximation)
  - Tooltip per method explains caveats and disagreement risk

**Method-disagreement warning:**
- When researchers switch methods, a banner notes: "Attribution methods can disagree. This view shows method X's attribution; consider running another method as a robustness check."

### 3.4 NDIF / backend requirements

**Attention-rollup endpoint:**
- Input: prompt, completion, target output token position, model
- Output: attribution score per prompt token
- Method: aggregate attention from all heads/layers from target output position back to prompt positions; standard rollup formula
- Latency: ~1s

**Integrated gradients endpoint:**
- Same input, different output
- Method: 50-step integration of gradient w.r.t. prompt-token embeddings
- Latency: 10–50s depending on completion length

**Attribution patching endpoint:**
- Same input
- Method: gradient-based approximation per Heimersheim et al.
- Latency: ~5s

### 3.5 Performance and caching

- Workshop deployment: pre-compute attribution for all curated examples + a couple of "interesting" output token positions per example
- Researcher mode: live compute; integrated gradients is the slow path

### 3.6 Edge cases

- **Method disagreement:** show the warning. Researchers can switch methods and compare; workshop participants see the default (attention rollup) only and a note that "this is one method's view of attribution."
- **Long prompts:** color saturation can wash out. Cap visible saturation; provide a numerical-table view as alternative.
- **Output token at start of completion:** limited prior context; flag with a small note.
- **Methods produce contradictory attributions:** acknowledge in the disagreement banner; for workshop, default to attention rollup as the most intuitive.

### 3.7 Implementation notes

Attribution machinery is real interpretability research. If Adam doesn't already have at least attention rollup in flight, this is 4–6 weeks of work — likely too much for the May/June Phase 1 timeline. **Recommendation: defer to Phase 2** unless attention rollup is already 80% built. If deferred, the workshop's Movement 2 closer can be the time-extended logit lens (Feature B) instead, which is much cheaper to ship.

### 3.8 Acceptance criteria

- Researcher can pick an output token and see attribution highlighted on prompt tokens in <2s for attention rollup
- Method-selector lets researcher compare three methods on the same target
- Disagreement banner is shown when methods would produce attributions whose top-3 attended tokens disagree
- (Workshop Mode acceptance only if Phase 1 ships with this feature, otherwise N/A)

### 3.9 Risk & mitigations

- **Method choice is a research decision, not a feature decision.** Mitigation: default to attention rollup; surface the choice in the UI; document the limitation.
- **Workshop participants over-interpret single-method attribution.** Mitigation: critical-framing prompt asks "what would change if we used a different attribution method?" — surfaces the uncertainty rather than hiding it.
- **Long prompts make visualization unreadable.** Mitigation: numerical-table view as alternative; cap color saturation; allow filtering to top-N attended prompt tokens.

---

## 4. Build sequencing & timeline

Aligned to Phase 1 pilot timeline (IRB final May 22, recruitment June, workshops July).

| Week | Feature work | Other |
|---|---|---|
| **Week 1 (May 4–10)** | Workshop Mode skeleton + INIF schema extension + Annotation pane + Critical-framing prompt component | IRB protocol drafting (Gwen) |
| **Week 2 (May 11–17)** | Feature A backend (multi-sample + branched continuation endpoints); start side-by-side comparison UI | IRB protocol drafting |
| **Week 3 (May 18–24)** | Feature A side-by-side UI + drill-down + Branching Indicator; pre-cache the workshop's demo payload | IRB submission May 22 |
| **Week 4 (May 25–31)** | Feature B sequence-wide logit lens endpoint + heat-strip UI; integration with existing logit lens panel | Curated examples verification (Adam runs all 18 on Llama-3 8B) |
| **Week 5 (June 1–7)** | Feature A polish + Feature B polish; Workshop Mode end-to-end testing on 3 curated examples | Recruitment Cohort 1 begins |
| **Week 6 (June 8–14)** | Bug-fix, latency tuning, full workshop dry-run with study-team-only participants | Recruitment continues |
| **Week 7 (June 15–21)** | Cohort 1 pilot session(s) | Pilot |
| **Phase 2 (Aug+)** | Feature C — Prompt Influence Tracing | Cohort 2 + analysis |

**Critical path:** Week 1 (cross-cutting infra) → Week 2 (A backend) → Week 5 (Workshop Mode dry-run). Feature B is parallel on Week 4, can slip without blocking. Feature C is explicitly out of Phase 1 scope.

**Adam's commitment estimate:** Features A + B + cross-cutting infra = ~5–6 weeks of focused Workbench dev time, fitting the May/June window if no major scope creep. Feature C is ~4–6 additional weeks if Phase 2 includes it.

---

## 5. Open decisions for Adam + Gwen

1. **Feature C go/no-go for Phase 1.** My recommendation: defer to Phase 2 unless attention rollup is already substantially built. Adam's call.
2. **Workshop Mode as a separate UI vs. an overlay on Education tab.** Recommendation: separate UI with its own URL — simpler to lock down, clearer for participants. Adam's call.
3. **Branching Indicator persistence.** Should it remain visible throughout Tasks 1–3, or only during the Movement 2 opener? Recommendation: persistent (it's the framing scaffold), but make it dismissible by participant if they find it distracting.
4. **Pre-caching policy.** All 18 curated examples × 5 features (3 task ops + commitment-strip + branching) = up to 90 cached payloads. Storage and pre-compute time are real costs. Decide: pre-cache everything, or cache lazily on first workshop run.
5. **Attribution method default for Feature C.** If shipped, should the workshop default be attention rollup (intuitive, fast, contested) or integrated gradients (slow, defensible)? Recommendation: attention rollup with the disagreement banner; explicit caveat in the critical-framing prompt.
6. **Annotation export format.** PDF (looks polished, hard to edit), markdown (editable, less polished), or both. Recommendation: both — markdown for the participant, PDF auto-generated copy for the study record.

---

## 6. What this spec deliberately does NOT cover

- **Detailed visualization design** (color palettes, exact widget dimensions, animation easing) — these are Gwen's call, not Jon's.
- **Backend NDIF API specifics** beyond what's needed for the new endpoints — Adam owns the API design.
- **Authentication / IRB-bound data flow** — separate spec, owned by Gwen + IRB protocol.
- **Researcher-mode features** beyond what's needed for workshop support — researcher mode gets these features as a side-effect of Workshop Mode, but additional researcher-only affordances (saving, sharing, comparing across runs) are out of scope for this spec.

---

**Source.** Spec written 2026-04-30 from outside the Workbench codebase. Assumes the Education vs Workspace tab split from the Apr 27 meeting. Intended for Adam to scope the work, push back on anything that conflicts with shipped reality, and produce a build plan against the Phase 1 timeline.
