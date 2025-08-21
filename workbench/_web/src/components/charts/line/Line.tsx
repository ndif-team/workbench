"use client";

import type { Line } from "@/types/charts";
import { ResponsiveLine } from '@nivo/line'
import { lineMargin, lineTheme, lineColors } from '../theming'
import { useMemo } from "react";
import { resolveThemeCssVars } from "@/lib/utils";
import { Margin } from "@nivo/core";
import { hslFromCssVar } from "@/lib/utils";
import { Tooltip } from "./Tooltip";

interface LineProps {
    lines: Line[];
    onLegendClick?: (lineId: string) => void;
    margin?: Margin;
    yRange?: [number, number];
    highlightedLineIds?: Set<string>;
    onMouseDown?: (e: React.MouseEvent) => void;
    onMouseMove?: (e: React.MouseEvent) => void;
    onMouseLeave?: () => void;
    onClick?: (e: React.MouseEvent) => void;
    crosshairCanvasRef?: React.RefObject<HTMLCanvasElement>;
    lineCanvasRef?: React.RefObject<HTMLCanvasElement>;
    useTooltip?: boolean;
}

export function Line({
    lines,
    margin = lineMargin,
    onLegendClick = () => {},
    yRange = [0, 1],
    highlightedLineIds = new Set<string>(),
    onMouseDown,
    onMouseMove,
    onMouseLeave,
    onClick,
    crosshairCanvasRef,
    lineCanvasRef,
    useTooltip = false,
}: LineProps) {
    const resolvedTheme = useMemo(() => resolveThemeCssVars(lineTheme), [])

    const colorFn = useMemo(() => {
        const hasHighlighted = highlightedLineIds.size > 0;
        return (line: { id: string }) => {
            const lineIndex = lines.findIndex(l => l.id === line.id);
            const baseColor = lineColors[lineIndex % lineColors.length];
            const isHighlighted = highlightedLineIds.has(line.id);
            if (!hasHighlighted) return baseColor;
            if (isHighlighted) return baseColor;
            return hslFromCssVar('--border');
        };
    }, [lines, highlightedLineIds]);

    return (
        <div className="size-full flex flex-col">
            <div
                className="flex flex-wrap gap-3 justify-center min-h-[5%] p-3"
            >
                {lines.map((line, index) => {
                    const color = lineColors[index % lineColors.length];
                    const isHighlighted = highlightedLineIds.has(line.id);
                    const hasAnyHighlighted = highlightedLineIds.size > 0;

                    return (
                        <button
                            key={line.id}
                            onClick={() => onLegendClick(line.id)}
                            className="flex items-center gap-3 px-3 py-2 h-6 transition-colors"
                            style={{
                                opacity: hasAnyHighlighted && !isHighlighted ? 0.5 : 1
                            }}
                        >
                            <span
                                className="w-3 h-1 rounded-full"
                                style={{
                                    backgroundColor: hasAnyHighlighted && !isHighlighted ? '#d3d3d3' : color
                                }}
                            />
                            <span
                                className="text-xs"
                                style={{
                                    color: hasAnyHighlighted && !isHighlighted ? '#d3d3d3' : color
                                }}>
                                {line.id}
                            </span>
                        </button>
                    );
                })}
            </div>

            <div className="w-full cursor-crosshair relative h-[95%]"
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseLeave={onMouseLeave}
                onClick={onClick}
            >
                {crosshairCanvasRef && <canvas
                    ref={crosshairCanvasRef}
                    className="absolute inset-0 size-full z-10 pointer-events-none"
                />}
                {lineCanvasRef && <canvas
                    ref={lineCanvasRef}
                    className="absolute inset-0 size-full z-20"
                />}
                {useTooltip && <Tooltip />}
                <ResponsiveLine
                    data={lines}
                    margin={margin}
                    yScale={{
                        type: 'linear',
                        min: yRange[0],
                        max: yRange[1],
                        stacked: false,
                        reverse: false,
                    }}
                    axisBottom={{
                        legend: 'Layer',
                        legendOffset: 35,
                        tickSize: 0,
                        tickPadding: 10,
                        tickRotation: 0,
                    }}
                    axisLeft={{
                        legend: 'Probability',
                        legendOffset: -45,
                        tickSize: 0,
                        tickPadding: 10,
                        tickRotation: 0,
                    }}
                    theme={resolvedTheme}
                    colors={colorFn}
                    enableGridX={false}
                    isInteractive={false}
                    yFormat=">-.2f"
                    animate={false}
                    crosshairType="x"
                    enableSlices={false}
                    useMesh={false}
                    enableGridY={true}
                    enablePoints={false}
                    pointBorderWidth={0}
                />
            </div>
        </div>
    );
}