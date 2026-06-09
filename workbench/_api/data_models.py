from enum import Enum
from typing import Literal, Self

from pydantic import BaseModel, Field


class ModelHeat(str, Enum):
    """Deployment heat for an NDIF-served model, hottest-first.

    Used when merging multiple NDIF replicas of the same repo_id: resolve
    to the hottest so the user sees the best-case availability. ``DEPLOYING``
    ranks between warm and cold — a model actually serving on any replica
    should win over one still spinning up, but a spinning-up replica is
    "more available soon" than a cold one.
    """

    def __new__(cls, value: str, rank: int) -> Self:
        obj = str.__new__(cls, value)
        obj._value_ = value
        obj._rank = rank
        return obj

    HOT = ("hot", 0)
    WARM = ("warm", 1)
    DEPLOYING = ("deploying", 2)
    COLD = ("cold", 3)

    @property
    def rank(self) -> int:
        return self._rank

    @classmethod
    def hotter(cls, a: Self, b: Self) -> Self:
        """Return whichever heat is hotter (lower rank wins)."""
        return a if a.rank <= b.rank else b


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str

class NDIFResponse(BaseModel):
    job_id: str | None = None

class Token(BaseModel):
    idx: int
    id: int
    text: str
    target_ids: list[int] = Field(alias="targetIds")