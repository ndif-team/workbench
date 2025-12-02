from typing import List

from ...data_models.visualizations.line import (Line, 
                                                LineResponse, 
                                                Point)


class LinePlot:
    
    @classmethod
    def create(
        cls,
        data: List[List[float]],
        line_labels: List[str],
    ) -> LineResponse:

        lines: List[Line] = list()
        for x, y_values in enumerate(data):
            for line_idx, y in enumerate(y_values):
                if x == 0:
                    lines.append(
                        Line(
                            id=line_labels[line_idx].replace(" ", "_"), 
                            data=[Point(x=x, y=y)]
                        )
                    )
                else:
                    lines[line_idx].data.append(Point(x=x, y=y))

        return LineResponse(data=lines)