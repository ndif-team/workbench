from typing import List, Optional, Tuple

import torch

from ...data_models.tools.metrics import Metrics

from ..visualizations.heatmap import HeatmapPlot
from ..visualizations.line import LinePlot

from .metrics import MetricFunction
from .utils import process_logits


class LogitLens:

    @classmethod
    def run(
        cls,
        remote: bool,
        model,
        prompt: str,
        metric_func: MetricFunction,
        token_position: Optional[int] = None,
        target_ids: Optional[List[int]] = None,
        use_top_pred_as_target_ids: bool = False,
        top_k: int = 1,
        backend = None,
    ) -> str:

        with model.trace(
            prompt,
            remote=remote,
            backend=backend,
        ) as tracer:
            hs_decoded = []

            for layer in model.model.layers[:-1]:
                hs = layer.output

                if isinstance(hs, tuple):
                    hs = hs[0]

                hs = model.lm_head(model.model.ln_f(hs))
                hs = metric_func(hs)
                hs_decoded.append(hs)

            logits = model.output.logits
            top_predictions = logits.argmax(dim=-1)[0].to("cpu").tolist()
            logits = metric_func(logits)
            hs_decoded.append(logits)

            
            ids = [top_predictions] if use_top_pred_as_target_ids else target_ids

            l_values, l_indices = process_logits(hs_decoded, token_position, ids, top_k)

            results = (l_values, l_indices, top_predictions).save()

        return tracer.backend.job_id

    @staticmethod
    def make_heatmap(
        model,
        prompt: str,
        results: Tuple[List[List[float]], List[List[int]]],
        metric: Metrics,
    ):
        row_labels = model.tokenizer.batch_decode(model.tokenizer.encode(prompt))
        row_labels_right = [model.tokenizer.decode(position) for position in results[2]] if metric == Metrics.RANK or metric == Metrics.ENTROPY else None

        values = HeatmapPlot.transpose(results[0])

        if metric == Metrics.PROBABILITY:
            indices = HeatmapPlot.transpose(results[1])
            cell_labels = [model.tokenizer.batch_decode(row_indices) for row_indices in indices]
        else:
            indices = values
            cell_labels = [[f"{cell:.4f}" if isinstance(cell, float) else str(cell) for cell in row_indices] for row_indices in indices]

        return HeatmapPlot.create(
            data=values, 
            cell_labels=cell_labels, 
            row_labels=row_labels, 
            row_labels_right=row_labels_right,
            apply_log=metric == Metrics.RANK,
        )

    @staticmethod
    def make_line(
        model,
        target_ids: List[int],
        results: List[List[float]],
    ):
        target_tokens = model.tokenizer.batch_decode(torch.tensor(target_ids).unsqueeze(0).T)

        data = results[0]

        return LinePlot.create(
            data=data, 
            line_labels=target_tokens
        )
