import math
from typing import Any, List, Optional

from ...data_models.visualizations.heatmap import (HeatmapCell,
                                                   HeatmapResponse, 
                                                   HeatmapRow)


class HeatmapPlot:

    @classmethod
    def create(
        cls,
        data: List[List[float]],
        cell_labels: List[List[str]],
        row_labels: List[str],
        row_labels_right: Optional[List[str]] = None,
        apply_log: bool = False,
    ) -> HeatmapResponse:
        
        rows: List[HeatmapRow] = list()
        for row_idx, row_data in enumerate(data):
            row = HeatmapRow(
                id=row_labels[row_idx],
                data=[
                    HeatmapCell(
                        x=col_idx, 
                        y=math.log(row_data[col_idx]) if apply_log else row_data[col_idx],
                        label=cell_labels[row_idx][col_idx],
                    ) 
                    for col_idx 
                    in range(len(row_data))
                    ],
            )

            if row_labels_right is not None:
                row.right_axis_label = row_labels_right[row_idx]
            
            rows.append(row)

        return HeatmapResponse(data=rows)


    @classmethod
    def transpose(
        cls, 
        data: List[List[Any]]
    ) -> List[List[Any]]:
    
        data_T = list()
        for column_idx, column in enumerate(data):
            for row_idx, value in enumerate(column):
                if column_idx == 0:
                    data_T.append([value])
                else:
                    data_T[row_idx].append(value)

        return data_T


    




