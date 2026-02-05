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