from enum import Enum

from pydantic import BaseModel

class HeatmapCell(BaseModel):
    x: int
    y: float
    label: str

class HeatmapRow(BaseModel):
    id: str
    data: list[HeatmapCell]
    right_axis_label: str | None = None

class HeatmapResponse(BaseModel):
    data: list[HeatmapRow]