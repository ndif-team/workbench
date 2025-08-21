import { useMemo } from "react";
import { useHeatmapHover } from "./HeatmapHoverProvider";
import { getCellFromPosition } from "./heatmap-geometry";
import { useHeatmapCanvas } from "./HeatmapCanvasProvider";
import { interpolateBlues } from "d3-scale-chromatic";
import { useHeatmapData } from "./HeatmapDataProvider";


export const Tooltip = () => {
    const { hoverX, hoverY } = useHeatmapHover();
    const { heatmapCanvasRef } = useHeatmapCanvas();
    const { filteredData: data } = useHeatmapData();

    const valueToBlue = (value: number | null) => {
        if (value === null || Number.isNaN(value)) return "#cccccc";
        const v = Math.max(0, Math.min(1, value));
        return interpolateBlues(v);
    };

    const hoveredCell = useMemo(() => {
        if (hoverX == null || hoverY == null) return null;
        return getCellFromPosition(heatmapCanvasRef, data, hoverX, hoverY);
    }, [hoverX, hoverY, heatmapCanvasRef, data]);

    const hoveredXValue = useMemo(() => {
        if (!hoveredCell) return null;
        const firstRow = data[0];
        return firstRow?.data[hoveredCell.col]?.x ?? null;
    }, [hoveredCell, data]);

    const hoveredYValue = useMemo(() => {
        if (!hoveredCell) return null;
        const v = data[hoveredCell.row]?.data[hoveredCell.col]?.y;
        return typeof v === 'number' ? v : null;
    }, [hoveredCell, data]);

    const hoveredColor = useMemo(() => valueToBlue(hoveredYValue), [hoveredYValue]);

    const isVisible = useMemo(() => hoveredCell != null, [hoveredCell]);

    const tooltipLeft = useMemo(() => (hoverX == null ? null : hoverX + 12), [hoverX]);
    const tooltipTop = useMemo(() => (hoverY == null ? null : Math.max(0, hoverY - 12)), [hoverY]);

    if (!isVisible || tooltipLeft == null || tooltipTop == null) return null;

    return (
        <div
            className="absolute z-30 px-3 py-2 rounded shadow bg-background border text-sm pointer-events-none"
            style={{ left: tooltipLeft, top: tooltipTop }}
        >
            <div className="flex items-center gap-3">
                <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: hoveredColor ?? "transparent" }} />
                <span>x: {String(hoveredXValue ?? "")}</span>
                <span>y: {hoveredYValue == null ? '—' : hoveredYValue.toFixed(2)}</span>
            </div>
        </div>
    );
};

