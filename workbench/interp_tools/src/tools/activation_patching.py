from typing import List
import torch


from ..visualizations.types import ActivationPatchingData

def activation_patching(
    model, 
    src_prompt: str, 
    tgt_prompt: str,
    src_pos: int, 
    tgt_pos: int,
    backend,
    token_ids: List[int] = None,
    remote: bool = True,
):

    layers = len(model.model.layers)

    with model.session(remote=remote, backend=backend) as session:
        with model.trace(src_prompt):
            src_acts = list()
            for l_idx in range(layers):
                hs = model.model.layers[l_idx].output
                if isinstance(hs, tuple):
                    hs = hs[0]
                src_acts.append(hs[0, src_pos])

            src_pred = model.lm_head.output[0, -1].argmax(dim=-1).save()
            

        patched_logits_per_layer = list().save()
        with model.trace() as tracer:

            with tracer.invoke(tgt_prompt):
                clean_logits = model.lm_head.output[0, -1].save()
                clean_pred = model.lm_head.output[0, -1].argmax(dim=-1).save()

            for l_idx in range(layers):
                with tracer.invoke(tgt_prompt):
                    hs = model.model.layers[l_idx].output
                    if isinstance(hs, tuple):
                        hs = hs[0]
                    hs[0, tgt_pos][:] = src_acts[l_idx][:]
                    patched_logits_per_layer.append(torch.nn.functional.softmax(model.lm_head.output[0, -1], dim=-1).save())

    if remote:
        return session.backend.job_id

    return src_pred, clean_pred, patched_logits_per_layer


def format_data(
    patched_logits: List[torch.Tensor],
    tokenizer,
    src_pred: int,
    clean_pred: int,
):

    # let's figure out all the tokens we want to retun
    # unique set of top 10 tokens in each layer
    # INSERT_YOUR_CODE
    # Find top 10 token indices (by value) for each layer's logits using torch

    unique_indices = set()
    topk_indices_per_layer = []
    topk_values_per_layer = []
    for logits in patched_logits:
        topk = torch.topk(logits, 10)
        indices = topk.indices.tolist()
        values = topk.values.tolist()
        topk_indices_per_layer.append(indices)
        topk_values_per_layer.append(values)
        unique_indices.update(indices)

    unique_indices.discard(src_pred)
    unique_indices.discard(clean_pred)
    unique_indices = list(unique_indices)
    unique_indices = [src_pred, clean_pred] + unique_indices

    # Calculate per-token, per-layer probabilities and ranks as before
    token_stats = []
    for token_id in unique_indices:
        token_probs = []
        token_ranks = []
        for logits in patched_logits:
            token_probs.append(logits[token_id].item())
            # Rank of token_id: the index after sorting logits descending
            rank = torch.argsort(logits, descending=True).tolist().index(token_id)
            token_ranks.append(rank)
        total_rank = sum(token_ranks)
        token_stats.append({
            "token_id": token_id,
            "probs": token_probs,
            "ranks": token_ranks,
            "total_rank": total_rank,
        })

    # src_pred and clean_pred always at front, in that order (if present)
    final_token_stats = []
    for tid in [src_pred, clean_pred]:
        item = next((d for d in token_stats if d["token_id"] == tid), None)
        if item is not None:
            final_token_stats.append(item)
    # All remaining tokens sorted by smallest total_rank (ascending), excluding src_pred and clean_pred
    remaining = [
        d for d in token_stats
        if d["token_id"] != src_pred and d["token_id"] != clean_pred
    ]
    remaining.sort(key=lambda d: d["total_rank"])
    final_token_stats.extend(remaining)

    probabilities = [d["probs"] for d in final_token_stats]
    ranks = [d["ranks"] for d in final_token_stats]

    labels = [tokenizer.decode(token_id) for token_id in unique_indices]

    return ActivationPatchingData(
        lines=probabilities,
        tokenLabels=labels
    )
