from typing import List, Union
import torch

from ..visualizations.types import ActivationPatchingData

def activation_patching(
    model, 
    src_prompt: str, 
    tgt_prompt: str,
    src_pos: List[int],
    tgt_pos: List[int],
    backend,
    remote: bool = True,
):

    layers = len(model.model.layers)

    with model.session(remote=remote, backend=backend) as session:
        with model.trace(src_prompt):
            src_acts: List[List[torch.Tensor]] = list()

            for l_idx in range(layers):
                src_acts.append(list())
                hs = model.model.layers[l_idx].output

                if isinstance(hs, tuple):
                    hs = hs[0]

                for pos in src_pos:
                    src_acts[-1].append(hs[0, pos])

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

                    for pos, src_act in zip(tgt_pos, src_acts[l_idx]):
                        hs[0, pos][:] = src_act
                    
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
    # [L, V]
    logits_mat = torch.stack([t.detach() for t in patched_logits], dim=0)
    L, V = logits_mat.shape

    # ---- 1) Candidate token ids: src/clean + union of topk across layers ----
    topk_idx = logits_mat.topk(k=10, dim=1).indices  # [L, 10]
    cand = torch.unique(topk_idx.flatten())          # [K]

    # remove src/clean if present, then prepend them in order
    cand = cand[(cand != src_pred) & (cand != clean_pred)]
    token_ids = torch.cat(
        [torch.tensor([src_pred, clean_pred], device=logits_mat.device, dtype=cand.dtype), cand],
        dim=0
    )  # [T]

    # ---- 2) Per-token per-layer "probs" (really logits, same as your code) ----
    # probs: [L, T] -> later convert to list-of-lists per token
    probs_mat = logits_mat.index_select(dim=1, index=token_ids)

    # ---- 3) Exact ranks matching argsort().tolist().index(token_id) ----
    # sort indices per layer (descending): [L, V]
    sorted_idx = logits_mat.argsort(dim=1, descending=True)

    # invert permutation to get rank lookup: inv_rank[layer, token] = rank
    inv_rank = torch.empty_like(sorted_idx)
    inv_rank.scatter_(dim=1, index=sorted_idx, src=torch.arange(V, device=logits_mat.device).expand(L, V))

    # ranks: [L, T]
    ranks_mat = inv_rank.index_select(dim=1, index=token_ids)

    # ---- 4) Sort tokens: keep src, clean first; rest by total_rank ----
    total_rank = ranks_mat.sum(dim=0)  # [T]
    # indices for remaining tokens (excluding first two)
    rem_order = torch.argsort(total_rank[2:]) + 2
    order = torch.cat([torch.tensor([0, 1], device=logits_mat.device), rem_order], dim=0)

    token_ids = token_ids[order]
    probs_mat = probs_mat[:, order]
    ranks_mat = ranks_mat[:, order]

    # ---- 5) Build return structure ----
    probabilities = probs_mat.transpose(0, 1).tolist()  # [T, L]
    ranks = ranks_mat.transpose(0, 1).tolist()          # [T, L]
    labels = [tokenizer.decode(int(tid)) for tid in token_ids]

    return ActivationPatchingData(
        lines=probabilities,
        ranks=ranks,
        tokenLabels=labels
    )
