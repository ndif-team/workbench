from pydantic import BaseModel


class Point(BaseModel):
    x: int
    y: float

class Line(BaseModel):
    id: str
    data: list[Point]

class LineResponse(BaseModel):
    data: list[Line]
