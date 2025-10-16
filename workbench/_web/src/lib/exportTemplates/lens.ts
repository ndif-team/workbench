import type { LensConfigData } from "@/types/lens";

function escapeTripleDoubleQuotes(text: string): string {
  return text.replaceAll('"""', '\\"\\"\\"');
}

export function renderLensLine(cfg: LensConfigData): string {
  const prompt = escapeTripleDoubleQuotes(cfg.prompt);
  const tokenText = escapeTripleDoubleQuotes(cfg.token.text);

  return `MODEL_NAME = "${cfg.model}"
PROMPT = """${prompt}"""
TOKEN = {
    "idx": ${cfg.token.idx},
    "id": ${cfg.token.id},
    "text": """${tokenText}""",
    "target_ids": ${JSON.stringify(cfg.token.targetIds)}
}

import torch as t

def line(model, prompt, token):
    def decode(x):
        return model.lm_head(model.model.ln_f(x))

    results = []
    with model.trace(prompt, remote=False):
        for layer in model.model.layers:
            hidden_BLD = layer.output[0]
            logits_BLV = decode(hidden_BLD)

            # Compute probabilities over the relevant tokens
            logits_V = logits_BLV[0, token["idx"], :]
            probs_V = t.nn.functional.softmax(logits_V, dim=-1)

            # Gather probabilities over the predicted tokens
            target_probs_X = t.gather(probs_V, 0, t.tensor(token["target_ids"]))
            results.append(target_probs_X)

    return [r.tolist() for r in results]

# Example usage (pseudo):
# model = load_your_model(MODEL_NAME)
# outputs = line(model, PROMPT, TOKEN)
`;
}

export function renderLensHeatmap(cfg: LensConfigData): string {
  const prompt = escapeTripleDoubleQuotes(cfg.prompt);

  return `MODEL_NAME = "${cfg.model}"
PROMPT = """${prompt}"""

import torch as t

def heatmap(model, prompt):
    def decode(x):
        return model.lm_head(model.model.ln_f(x))

    pred_ids = []
    probs = []

    def _compute_top_probs(logits_BLV: t.Tensor):
        relevant_tokens_LV = logits_BLV[0, :, :]
        probs_LV = t.nn.functional.softmax(relevant_tokens_LV, dim=-1)
        pred_ids_L = relevant_tokens_LV.argmax(dim=-1)

        # Gather probabilities over the predicted tokens
        pred_ids_L1 = pred_ids_L.unsqueeze(1)
        probs_L = t.gather(probs_LV, 1, pred_ids_L1).squeeze()

        pred_ids.append(pred_ids_L)
        probs.append(probs_L)

    with model.trace(prompt, remote=False):
        for layer in model.model.layers[:-1]:
            _compute_top_probs(decode(layer.output[0]))
        _compute_top_probs(model.output.logits)

    # Return python lists for portability
    return [p.tolist() for p in pred_ids], [p.tolist() for p in probs]

# Example usage (pseudo):
# model = load_your_model(MODEL_NAME)
# pred_ids, probs = heatmap(model, PROMPT)
`;
}
