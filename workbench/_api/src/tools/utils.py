from typing import List, Optional, Tuple

import torch


def process_logits(
    l_logits: List[torch.Tensor],
    token_position: Optional[int] = None,
    target_ids: Optional[List[int]] = None,
    top_predictions: int = 1,
) -> Tuple[List[List[float]], List[List[int]]]:

    if target_ids is not None:
        target_ids = torch.tensor(target_ids).T

    l_values = []
    l_indices = []
    for logits in l_logits:
        logits = logits[0] if logits.dim() == 3 else logits # index batch dimension

        if token_position is not None:
            logits = logits[token_position] # select token position
        
        if target_ids is not None:
            logits = torch.gather(logits, -1, target_ids.to(logits.device))
            if logits.dim() == 2:
                logits = logits.squeeze()
            logits = logits.to("cpu").tolist()

            l_values.append(logits)
            l_indices.append(target_ids.to("cpu").tolist())
        else:
            if top_predictions > 0:
                logits, indices = torch.topk(logits, top_predictions, dim=-1)
                logits = logits.squeeze()
                indices = indices.squeeze()
                indices = indices.to("cpu").tolist()
            else:
                logits = logits[0]
                indices = []
            
            l_values.append(logits.to("cpu").tolist())
            l_indices.append(indices)

    return l_values, l_indices
