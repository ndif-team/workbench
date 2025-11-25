import torch

from ...data_models.tools.metrics import Metrics

class MetricFunction:

    def __init__(self, metric):
        self.metric = metric
        self.func = MetricFunction.func_map[self.metric]


    def __call__(self, *args, **kwargs):
        return self.func(*args, **kwargs)
    

    @staticmethod
    def probability(
        t: torch.Tensor,
    ) -> torch.Tensor:
    
        probs = torch.nn.functional.softmax(t, dim=-1)

        return probs


    @staticmethod
    def rank(
        t: torch.Tensor,
    ) -> torch.Tensor:

        sorted_indices = torch.argsort(t, dim=-1, descending=True)
        ranks = torch.zeros_like(sorted_indices)
        r = torch.arange(t.size(-1), device=t.device)
        if t.dim() > 1:
            r = r.expand_as(sorted_indices)
        ranks.scatter_(-1, sorted_indices, r)

        ranks = ranks + 1

        return ranks


    @staticmethod
    def entropy(
        t: torch.Tensor,
    ) -> torch.Tensor:

        log_p = torch.nn.functional.log_softmax(t, dim=-1)     # stable log-softmax
        p = log_p.exp()
        H = -(p * log_p).sum(dim=-1)

        return H

    func_map = {
        Metrics.PROBABILITY: probability,
        Metrics.RANK: rank,
        Metrics.ENTROPY: entropy,
    }

    def __eq__(self, other: Metrics):
        return self.metric == other
