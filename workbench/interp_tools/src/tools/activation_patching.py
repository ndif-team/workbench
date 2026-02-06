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
    token_ids: List[int],
):

    lines = list()
    for token_id in token_ids:
        for layer_idx, logits in enumerate(patched_logits):
            if layer_idx == 0:
                lines.append(list())

            lines[-1].append(logits[token_id].item())


    return ActivationPatchingData(
        lines= lines
    )
