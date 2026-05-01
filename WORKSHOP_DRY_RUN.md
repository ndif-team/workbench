# Workshop dry-run checklist

Pre-pilot smoke for Adam (~24 hours before each cohort runs the workshop).

## Local sanity

```sh
# 1. Backend unit tests
uv run pytest workbench/_api/tests/ -v
# Expect: 15 passed (loader + branching/commitment shape contracts)

# 2. Frontend unit tests
cd workbench/_web && bun run test
# Expect: 46 passed (existing local-db + new workshop-annotations)

# 3. Pre-cache workshop fixtures (synthetic; no NDIF needed)
uv run python scripts/precache_workshop_payloads.py --mode synthetic
# Expect: 7 files written under workbench/_api/_workshop_examples/
```

## Real-NDIF pre-workshop verification

```sh
# 1. Boot the FastAPI backend with NDIF auth
export NDIF_API_KEY=...   # from secrets vault
export HF_TOKEN=...       # from secrets vault
uv run uvicorn workbench._api.main:app --host 0.0.0.0 --port 8000

# 2. Re-run the pre-cache script in real mode (~3h NDIF compute per spec)
uv run python scripts/precache_workshop_payloads.py --mode real

# 3. Spot-check 3 examples in Workshop Mode (browser):
#    - /workshop/branching_demo_workshop          (3 trajectories, drill-down works)
#    - /workshop/task1_ex4_lamarr_coinventor      (suppressed-correct ★)
#    - /workshop/task1_ex1_51st_state             (LIVE DEMO)
```

## Per-example verification (Adam, per `workshop-curated-examples-2026-04-30.md` §protocols)

- [ ] Task 1 #1 51st State — Puerto Rico hallucination clearly visible mid→late layers
- [ ] Task 1 #2 MRI — multiple-name competition resolves to single completion
- [ ] Task 1 #3 Bandura — fluent paraphrase, frame-level hallucination
- [ ] Task 1 #4 Lamarr ★ — suppressed-correct pattern manifests; otherwise swap to Volvo/Bohlin
- [ ] Task 1 #5 Higgs — multi-fact cascade
- [ ] Task 1 #6 Foucault — Zuboff terms appear alongside Foucault terms
- [ ] Branching demo — three temperatures show distinct continuations; drill-down at a divergent token shows ≥3 alternatives

## Pilot day

- [ ] Backend boots, `curl /examples/branching_demo_workshop` returns 200
- [ ] `bun run start` serves /workshop without errors
- [ ] Cookie banner / participant onboarding flow tested with two browsers (annotations isolated by session)
- [ ] Argos screenshots green on the most recent CI run
- [ ] Session-summary download produces non-empty markdown for a session with ≥1 annotation
- [ ] Branching Indicator visible on every Task 1 page; dismissible; persistent within a session

## Edge cases the UI handles (no manual workaround needed)

- All-identical samples → "raise temperature" message instead of empty side-by-side
- Drill-down on a >0.99-prob token → "no realistic alternatives" message
- Heat-strip on completion < 20 tokens → legend hidden (saves vertical space)
- Tokens that never commit → gray "unsettled" highlight, accurate tooltip
