import json
from typing import List, Tuple, Optional

from .metrics import Metrics
from ..visualizations.heatmap import HeatmapPlot
from .utils import process_logits

from .metrics import MetricFunction
from ...data_models.tools.metrics import Metrics

import torch


class ConceptLens:

    @classmethod
    def run(
        cls,
        remote: bool,
        model,
        prompt: str,
        concept_heads: List[Tuple[int, int]],
        token_position: Optional[int] = None,
        target_ids: Optional[List[int]] = None,
        top_k: int = 5,
        metric_func: MetricFunction = MetricFunction(Metrics.PROBABILITY),
        backend = None,
    ) -> str:

        with model.session(
            remote=remote,
            backend=backend,
        ) as session:

            concept_proj_matrix = torch.zeros(model.config.hidden_size, model.config.hidden_size).to("cuda")

            head_dim = model.config.hidden_size // model.config.num_attention_heads
            V_heads_per_query = model.config.num_attention_heads // model.config.num_key_value_heads

            for head in concept_heads:

                O_start_idx = head[1] * head_dim
                O_end_idx = O_start_idx + head_dim

                V_start_idx = (head[1] // V_heads_per_query) * head_dim
                V_end_idx = V_start_idx + head_dim

                O = model.model.layers[head[0]].self_attn.o_proj.weight[:,O_start_idx:O_end_idx].to("cuda")
                V = model.model.layers[head[0]].self_attn.v_proj.weight[V_start_idx:V_end_idx,:].to("cuda")

                concept_proj_matrix += torch.matmul(O, V)

            with model.trace(prompt) as tracer:
                hs_decoded = []

                for layer in model.model.layers:
                    hs = layer.output

                    if isinstance(hs, tuple):
                        hs = hs[0]

                    hs = hs[0, token_position, :]
                    hs = concept_proj_matrix.to(hs.device) @ hs

                    hs = model.lm_head(model.model.ln_f(hs))
                    hs = metric_func(hs)
                    hs_decoded.append(hs)

                l_values, l_indices = process_logits(hs_decoded, None, target_ids, top_k)

                results = (l_values, l_indices).save()

        return session.backend.job_id


    @staticmethod
    def get_concept_heads(state, model_name: str):

        n_concept_heads = state.config.tools["concept-lens"].get_tool_model_config(model_name).n_concept_heads

        concept_heads = state.get_model_tool_data(model_name, "concept-lens")["concept_heads"]
        concept_heads = concept_heads[:n_concept_heads]

        return concept_heads

    @staticmethod
    def make_heatmap(
        model,
        results: Tuple[List[List[float]], List[List[int]]],
    ):

        values = HeatmapPlot.transpose(results[0])
        indices = HeatmapPlot.transpose(results[1])
        cell_labels = [model.tokenizer.batch_decode(row_indices) for row_indices in indices]
        row_labels = [str(i+1) for i in range(len(values))]

        return HeatmapPlot.create(
            data=values, 
            cell_labels=cell_labels, 
            row_labels=row_labels, 
        )
