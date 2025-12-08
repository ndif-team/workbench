"use client";

import { useMemo } from "react";
import { getCellFromPosition } from "../heatmap-geometry";
import { interpolateBlues } from "d3-scale-chromatic";
import { useHeatmapHover } from "./MockHeatmapHoverProvider";
import { useHeatmapCanvas } from "./MockHeatmapCanvasProvider";
import { useMockHeatmapData } from "./MockHeatmapDataProvider";

interface StorybookTokenPopoverProps {
    maxTokens?: number; // default: 10
}

export const StorybookTokenPopover = ({ maxTokens = 10 }: StorybookTokenPopoverProps) => {
    const { hoverX, hoverY } = useHeatmapHover();
    const { heatmapCanvasRef } = useHeatmapCanvas();
    const { filteredData: data } = useMockHeatmapData();

    const valueToBlue = (value: number | null) => {
        if (value === null || Number.isNaN(value)) return "#cccccc";
        const v = Math.max(0, Math.min(1, value));
        return interpolateBlues(v);
    };

    const hoveredCell = useMemo(() => {
        if (hoverX == null || hoverY == null || !heatmapCanvasRef) return null;
        return getCellFromPosition(heatmapCanvasRef, data, hoverX, hoverY);
    }, [hoverX, hoverY, heatmapCanvasRef, data]);

    const cellData = useMemo(() => {
        if (!hoveredCell) return null;
        return data[hoveredCell.row]?.data[hoveredCell.col] ?? null;
    }, [hoveredCell, data]);

    const topTokens = useMemo(() => {
        if (!cellData?.topTokens || cellData.topTokens.length === 0) return null;
        // Sort by probability descending and take top N
        return [...cellData.topTokens]
            .sort((a, b) => b.probability - a.probability)
            .slice(0, maxTokens);
    }, [cellData, maxTokens]);

    const isVisible = useMemo(() => {
        return hoveredCell != null && topTokens != null && topTokens.length > 0;
    }, [hoveredCell, topTokens]);

    // Smart positioning - avoid going off screen
    const popoverPosition = useMemo(() => {
        if (hoverX == null || hoverY == null || !heatmapCanvasRef?.current) {
            return { left: null, top: null };
        }

        const rect = heatmapCanvasRef.current.getBoundingClientRect();
        const canvasWidth = rect.width;
        const canvasHeight = rect.height;

        // Estimate popover size (will be ~280px wide, ~400px tall for 10 tokens)
        const popoverWidth = 280;
        const popoverHeight = Math.min(400, (topTokens?.length ?? 0) * 36 + 60);

        // Default: show to the right and slightly above cursor
        let left = hoverX + 12;
        let top = Math.max(0, hoverY - 12);

        // If too close to right edge, show on left side
        if (left + popoverWidth > canvasWidth) {
            left = hoverX - popoverWidth - 12;
        }

        // If too close to bottom edge, adjust upward
        if (top + popoverHeight > canvasHeight) {
            top = Math.max(0, canvasHeight - popoverHeight - 12);
        }

        return { left, top };
    }, [hoverX, hoverY, heatmapCanvasRef, topTokens]);

    if (!isVisible || popoverPosition.left == null || popoverPosition.top == null) {
        return null;
    }

    return (
        <div
            className="absolute z-30 rounded-lg shadow-lg bg-background border border-border text-sm pointer-events-none overflow-hidden"
            style={{
                left: `${popoverPosition.left}px`,
                top: `${popoverPosition.top}px`,
                minWidth: "260px",
                maxWidth: "320px",
            }}
        >
            <div className="px-4 py-3 border-b border-border bg-muted/50">
                <div className="text-xs font-medium text-muted-foreground">
                    Top {topTokens?.length ?? 0} Tokens
                </div>
            </div>
            <div className="py-2 max-h-[400px] overflow-y-auto">
                {topTokens?.map((token, index) => {
                    const barColor = valueToBlue(token.probability);
                    return (
                        <div
                            key={`${token.token}-${index}`}
                            className="px-4 py-2 flex items-center gap-3"
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="text-xs font-mono truncate" title={token.token}>
                                        {token.token}
                                    </span>
                                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                                        {(token.probability * 100).toFixed(1)}%
                                    </span>
                                </div>
                                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div
                                        className="h-full transition-all"
                                        style={{
                                            width: `${token.probability * 100}%`,
                                            backgroundColor: barColor,
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
