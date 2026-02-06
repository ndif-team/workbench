from pydantic import BaseModel

class LogitLensMeta(BaseModel):
    version: int = 2
    timestamp: str
    model: str

class LogitLensData(BaseModel):
    meta: LogitLensMeta
    layers: list[int]
    input: list[str]  # Input tokens as strings
    tracked: list[dict[str, list[float]]]  # Per-position: token -> trajectory
    topk: list[list[list[str]]]  # [layer][position] -> list of top-k tokens
    entropy: list[list[float]] | None = None  # Optional: [layer][position] -> entropy


# class ActivationsPatchingMeta(BaseModel):
#     version: int = 1
#     timestamp: str
#     model: str

class ActivationPatchingData(BaseModel):
    # meta: ActivationsPatchingMeta
    lines: list[list[float]]  # Each inner list is probabilities for one token across all layers
    ranks: list[list[int]]  # Each inner list is ranks for one token across all layers
    tokenLabels: list[str]  # Token text labels for each line