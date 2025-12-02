from ..visualizations.line import LinePlot

import torch

from .utils import process_logits

class ActivationPatching:
    
    @staticmethod
    def run(
        remote,
        model,
        src_prompt,
        src_position,
        trg_prompt,
        trg_position,
        metric_func,
        trg_ids = None,
        backend = None
    ):
        with model.session(remote=remote, backend=backend) as session:

            source_activations = list()
            with model.trace(src_prompt) as tracer:
                for i, layer in enumerate(model.model.layers):
                    if isinstance(layer.output, tuple):
                        source_activations.append(layer.output[0][0, src_position, :].detach())
                    else:
                        source_activations.append(layer.output[0, src_position, :].detach())

                src_pred = model.lm_head.output[0][-1].argmax(dim=-1)

            with model.trace() as tracer:
                with tracer.invoke(trg_prompt):
                    tgt_pred = model.lm_head.output[0][-1].argmax(dim=-1)

            with model.trace() as tracer:
                target_logits_patched = list().save()
                for i in range(len(model.model.layers)):
                    with tracer.invoke(trg_prompt):
                        if isinstance(model.model.layers[i].output, tuple):
                            model.model.layers[i].output[0][0, trg_position, :] = source_activations[i]
                        else:
                            model.model.layers[i].output[0, trg_position, :] = source_activations[i]

                        target_logits_patched.append(metric_func(model.lm_head.output.detach()).cpu())

            ids = [src_pred, tgt_pred] if trg_ids is None else trg_ids

            results = process_logits(target_logits_patched, -1, ids).save()

        return session.backend.job_id

    
    @staticmethod
    def make_line(
        model,
        target_ids,
        results,
    ):
        data = results[0]
        target_ids = results[1][0] if target_ids is None or target_ids == [] else target_ids
        target_tokens = model.tokenizer.batch_decode(torch.tensor(target_ids).unsqueeze(0).T)

        return LinePlot.create(
            data=data, 
            line_labels=target_tokens
        )
