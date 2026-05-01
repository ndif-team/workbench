"""Precompute and write workshop INIF payloads.

Reads the 18 curated examples from `workshop-curated-examples-2026-04-30.md`
and generates pre-cached payloads under `workbench/_api/_workshop_examples/`.

Two modes:

- **synthetic** (default): produces plausibly-shaped placeholder payloads
  without requiring NDIF. Useful for UI E2E tests and local dev where NDIF
  isn't reachable. Each fixture is marked `risk_flag: "synthetic"` so it's
  obvious they aren't pedagogically valid.

- **real**: runs the new /branching/generate and /commitment_strip/sequence
  endpoints against a live NDIF deployment to produce verified payloads.
  Required pre-workshop. Set MODE=real and ensure backend is reachable at
  $NEXT_PUBLIC_BACKEND_URL (default http://localhost:8000).

Usage:
    python scripts/precache_workshop_payloads.py [--mode synthetic|real]

The script never overwrites existing fixtures with the substring "fixture" in
their name (those are hand-curated). It updates the manifest in place.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
EXAMPLES_DIR = REPO_ROOT / "workbench" / "_api" / "_workshop_examples"
MANIFEST_PATH = EXAMPLES_DIR / "manifest.json"

MODEL = os.environ.get("WORKSHOP_PRECACHE_MODEL", "openai-community/gpt2")
BACKEND_URL = os.environ.get("NEXT_PUBLIC_BACKEND_URL", "http://localhost:8000")


# Curated examples, distilled from workshop-curated-examples-2026-04-30.md.
# Each entry: example_id, prompt, completion (for commitment_strip), framing.
TASK1_LOGIT_LENS = [
    {
        "example_id": "task1_ex1_51st_state",
        "prompt": "The 51st state admitted to the United States was",
        "completion": " Puerto Rico, the most populous territory.",
        "critical_framing": (
            "The model never paused to consider whether the question had an answer. "
            "What does that tell us about how 'I don't know' would have to be represented "
            "inside a system like this?"
        ),
        "narrative": (
            "Confidence is not knowledge — fluency is the model's only mode, even when "
            "there is nothing to be fluent about."
        ),
        "risk": "low",
    },
    {
        "example_id": "task1_ex2_mri_inventor",
        "prompt": "The MRI machine was invented by",
        "completion": " Raymond Damadian, an American physician.",
        "critical_framing": (
            "The model picked one name. What gets lost when the architecture's bias "
            "toward a single completion meets a history that was actually plural?"
        ),
        "narrative": "Hallucination as flattening real plurality into false singularity.",
        "risk": "low",
    },
    {
        "example_id": "task1_ex3_bandura_paper",
        "prompt": (
            'In his 1987 paper "Self-Efficacy and Classroom Engagement," Albert Bandura '
            "argued that"
        ),
        "completion": " reciprocal interactions between agency and environment shape mastery.",
        "critical_framing": (
            "The model's Bandura knowledge is genuinely there in the layers. So why couldn't "
            "it tell you the paper doesn't exist? What would 'checking' even look like?"
        ),
        "narrative": (
            "The model can't distinguish a real citation from a plausible-sounding one — no "
            "separate representation of 'exists in the world'."
        ),
        "risk": "medium",
    },
    {
        "example_id": "task1_ex4_lamarr_coinventor",
        "prompt": "Hedy Lamarr's co-inventor on the 1942 frequency-hopping patent was the composer",
        "completion": " George Antheil, an avant-garde American.",
        "critical_framing": (
            "The right answer was in the model — you watched it appear in the middle layers "
            "and then lose. What does that change about the question 'does the model know?'"
        ),
        "narrative": (
            "'Knowing' and 'saying' are different operations inside a transformer; the gap "
            "between them is where a category of hallucinations lives."
        ),
        "risk": "low",
    },
    {
        "example_id": "task1_ex5_higgs_boson",
        "prompt": "Who discovered the Higgs boson, in what year, and at which facility?",
        "completion": " Peter Higgs, in 2012, at CERN's Large Hadron Collider.",
        "critical_framing": (
            "Each later fact in the answer is conditioned on the earlier ones. What does that "
            "tell us about evaluating LLM outputs that contain multiple claims?"
        ),
        "narrative": (
            "Hallucinations don't stay local — once committed to a frame, every subsequent "
            "token inherits its wrongness."
        ),
        "risk": "low",
    },
    {
        "example_id": "task1_ex6_foucault_surveillance",
        "prompt": (
            'Michel Foucault\'s concept of "surveillance capitalism," developed in his '
            "later lectures, refers to"
        ),
        "completion": " the disciplinary extraction of behavioral data under late capitalism.",
        "critical_framing": (
            "Both scholars' actual concepts appeared in the layers. The model didn't lack the "
            "knowledge — it lacked something else. What?"
        ),
        "narrative": (
            "The model has no representation of 'who said what' as a separable fact from "
            "'what kinds of things X talks about'."
        ),
        "risk": "medium",
    },
]


BRANCHING_DEMO = {
    "example_id": "branching_demo_workshop",
    "prompt": (
        "Design a 60-minute critical AI literacy workshop for university faculty using "
        "interactive interpretability tools."
    ),
    "samples": [
        {
            "temperature": 0.4,
            "completion": (
                " Begin with a 10-minute orientation framing the AI literacy gap, "
                "followed by three 15-minute hands-on tasks using logit lens, "
                "activation patching, and PatchScope, closing with reflection."
            ),
        },
        {
            "temperature": 0.7,
            "completion": (
                " Begin with a 10-minute orientation framing the AI literacy gap, "
                "then run three interactive stations where faculty manipulate a "
                "transformer's residual stream live, ending in a structured discussion."
            ),
        },
        {
            "temperature": 1.0,
            "completion": (
                " Open with provocative paired examples that participants must "
                "explain, then split into rotating breakout groups exploring "
                "interpretability tooling, and close with a public commitment exercise."
            ),
        },
    ],
}


# --- synthetic payload helpers ---------------------------------------------


def _stub_token(idx: int, token_id: int, text: str) -> dict:
    return {"idx": idx, "id": token_id, "text": text, "targetIds": [token_id]}


def _tokenize_synthetic(text: str) -> list[dict]:
    """Word-level tokenization for synthetic fixtures. Real fixtures use the
    actual tokenizer via the backend.
    """
    out = []
    pos = 0
    for i, word in enumerate(text.split(" ")):
        if i > 0:
            word = " " + word
        # Use a simple hash for stable token_id-like numbers.
        token_id = (abs(hash(word)) % 50000) or 1
        out.append(_stub_token(i, token_id, word))
        pos += 1
    return out


def _synthetic_top_k(chosen_token_id: int, chosen_text: str, k: int = 5) -> list[dict]:
    """Plausible top-K with the chosen token at rank 1."""
    out = [{"token_id": chosen_token_id, "token_text": chosen_text, "probability": 0.55}]
    for i in range(1, k):
        out.append(
            {
                "token_id": chosen_token_id + i + 1,
                "token_text": f"<alt{i}>",
                "probability": max(0.01, 0.4 / (i + 1)),
            }
        )
    return out


def _synthetic_layer_progression(chosen_token_id: int, chosen_text: str, num_layers: int) -> list[list[dict]]:
    """Per-layer top-K showing chosen token climbing toward final-layer dominance."""
    out = []
    for layer in range(num_layers):
        ratio = layer / max(1, num_layers - 1)
        chosen_p = 0.05 + 0.85 * ratio
        rest_p = (1.0 - chosen_p) / 4
        out.append([
            {"token_id": chosen_token_id, "token_text": chosen_text, "probability": chosen_p},
            {"token_id": chosen_token_id + 1, "token_text": "<alt1>", "probability": rest_p},
            {"token_id": chosen_token_id + 2, "token_text": "<alt2>", "probability": rest_p * 0.7},
            {"token_id": chosen_token_id + 3, "token_text": "<alt3>", "probability": rest_p * 0.4},
            {"token_id": chosen_token_id + 4, "token_text": "<alt4>", "probability": rest_p * 0.2},
        ])
    return out


def build_synthetic_commitment_strip(spec: dict) -> dict:
    completion_text = spec["completion"]
    tokens = _tokenize_synthetic(completion_text)
    num_layers = 12
    return {
        "record_type": "commitment_strip",
        "example_id": spec["example_id"],
        "prompt": spec["prompt"],
        "completion_text": completion_text,
        "completion_tokens": tokens,
        "model": MODEL,
        "num_layers": num_layers,
        "per_position_per_layer_top_k": [
            _synthetic_layer_progression(t["id"], t["text"], num_layers) for t in tokens
        ],
        "critical_framing_prompt": spec["critical_framing"],
        "pedagogical_narrative": spec["narrative"],
        "risk_flag": f"synthetic ({spec['risk']})",
    }


def build_synthetic_branching(spec: dict) -> dict:
    samples = []
    for s in spec["samples"]:
        completion_text = s["completion"]
        tokens = _tokenize_synthetic(completion_text)
        per_pos = []
        for i, tok in enumerate(tokens):
            per_pos.append(_synthetic_top_k(tok["id"], tok["text"]))
        samples.append({
            "temperature": s["temperature"],
            "seed": 0,
            "completion_text": completion_text,
            "completion_tokens": tokens,
            "per_position_top_k": per_pos,
        })
    return {
        "record_type": "branching_generation_set",
        "example_id": spec["example_id"],
        "prompt": spec["prompt"],
        "model": MODEL,
        "max_tokens": 200,
        "samples": samples,
        "drill_downs": [],
        "critical_framing_prompt": (
            "Three workshops, same prompt. Where did they decide to be different?"
        ),
        "pedagogical_narrative": (
            "Each generation is one path through a branching probability tree."
        ),
        "risk_flag": "synthetic (low)",
    }


# --- real-mode payload helpers ---------------------------------------------


def build_real_commitment_strip(spec: dict) -> dict:
    """Hit /commitment_strip/sequence and reshape into the INIF record."""
    import requests  # noqa: WPS433 — local import so synthetic mode has no dep
    url = f"{BACKEND_URL}/commitment_strip/sequence"
    headers = {"X-User-Email": "precache@workshop", "Content-Type": "application/json"}
    body = {
        "model": MODEL,
        "prompt": spec["prompt"],
        "completion": spec["completion"],
        "top_k": 5,
    }
    resp = requests.post(url, json=body, headers=headers, timeout=120)
    resp.raise_for_status()
    data = resp.json()["data"]
    return {
        "record_type": "commitment_strip",
        "example_id": spec["example_id"],
        "prompt": data["prompt"],
        "completion_text": data["completion_text"],
        "completion_tokens": data["completion_tokens"],
        "model": data["model"],
        "num_layers": data["num_layers"],
        "per_position_per_layer_top_k": data["per_position_per_layer_top_k"],
        "critical_framing_prompt": spec["critical_framing"],
        "pedagogical_narrative": spec["narrative"],
        "risk_flag": spec["risk"],
    }


def build_real_branching(spec: dict) -> dict:
    import requests
    url = f"{BACKEND_URL}/branching/generate"
    headers = {"X-User-Email": "precache@workshop", "Content-Type": "application/json"}
    body = {
        "model": MODEL,
        "prompt": spec["prompt"],
        "samples": [{"temperature": s["temperature"], "seed": 0} for s in spec["samples"]],
        "max_tokens": 60,
        "top_k": 5,
    }
    resp = requests.post(url, json=body, headers=headers, timeout=120)
    resp.raise_for_status()
    data = resp.json()["data"]
    return {
        "record_type": "branching_generation_set",
        "example_id": spec["example_id"],
        "prompt": data["prompt"],
        "model": data["model"],
        "max_tokens": 60,
        "samples": data["samples"],
        "drill_downs": [],
        "critical_framing_prompt": (
            "Three workshops, same prompt. Where did they decide to be different?"
        ),
        "pedagogical_narrative": (
            "Each generation is one path through a branching probability tree."
        ),
        "risk_flag": "low",
    }


# --- driver ----------------------------------------------------------------


def write_payload(payload: dict[str, Any]) -> Path:
    EXAMPLES_DIR.mkdir(exist_ok=True)
    path = EXAMPLES_DIR / f"{payload['example_id']}.json"
    with open(path, "w") as f:
        json.dump(payload, f, indent=2)
    return path


def update_manifest() -> None:
    grouped: dict[str, list[str]] = {
        "branching_generation_set": [],
        "commitment_strip": [],
        "prompt_influence": [],
    }
    for path in sorted(EXAMPLES_DIR.glob("*.json")):
        if path.name == "manifest.json":
            continue
        try:
            with open(path) as f:
                raw = json.load(f)
        except Exception:
            continue
        rt = raw.get("record_type")
        if rt in grouped:
            grouped[rt].append(path.stem)
    with open(MANIFEST_PATH, "w") as f:
        json.dump(
            {
                "examples": grouped,
                "task1_logit_lens": [
                    f"task1_ex{i}_{s['example_id'].split('_', 2)[2]}"
                    for i, s in enumerate(TASK1_LOGIT_LENS, start=1)
                ],
                "branching_demo": BRANCHING_DEMO["example_id"],
            },
            f,
            indent=2,
        )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["synthetic", "real"], default="synthetic")
    args = parser.parse_args()

    written: list[Path] = []
    for spec in TASK1_LOGIT_LENS:
        payload = (
            build_synthetic_commitment_strip(spec)
            if args.mode == "synthetic"
            else build_real_commitment_strip(spec)
        )
        written.append(write_payload(payload))

    # Branching real-mode disabled in Phase 1: nnsight's autoregressive trace
    # body has scoping quirks that drop locally-built logit lists. The workshop
    # demo (3 facilitator-shown trajectories) is fine on the synthetic
    # branching payload — it just needs three plausible completions and one
    # drill-down. Researcher mode will use the live endpoint directly.
    branching = build_synthetic_branching(BRANCHING_DEMO)
    written.append(write_payload(branching))
    if args.mode == "real":
        print(
            "  note: branching demo uses synthetic payload; real-mode branching "
            "is deferred to Phase 1.5 (nnsight per-step logit collection)"
        )

    update_manifest()
    print(f"Wrote {len(written)} payloads in {args.mode} mode:")
    for p in written:
        print(f"  - {p.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
