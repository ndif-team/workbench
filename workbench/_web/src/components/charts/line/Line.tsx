"use client";

import type { Line } from "@/types/charts";
import { ResponsiveLine } from '@nivo/line'
import { lineMargin, lineTheme, lineColors } from '../theming'
import { useMemo } from "react";
import { resolveThemeCssVars } from "@/lib/utils";
import { Margin } from "@nivo/core";
import { hslFromCssVar } from "@/lib/utils";
import { Tooltip } from "./Tooltip";
import { useLineData } from "./LineDataProvider";
import { Metrics } from "@/types/lens";

// Helper function to generate good logarithmic tick values
const generateLogTickValues = (min: number, max: number): number[] => {
    const ticks: number[] = [];
    
    // Start from the power of 10 at or below min
    let startPower = Math.floor(Math.log10(min));
    let endPower = Math.ceil(Math.log10(max));
    
    // Generate ticks at powers of 10 and key intermediate values
    for (let power = startPower; power <= endPower; power++) {
        const base = Math.pow(10, power);
        
        // Add the main power of 10
        if (base >= min && base <= max) {
            ticks.push(base);
        }
        
        // Add key intermediate values (2, 5 times the power of 10)
        for (const multiplier of [2, 5]) {
            const value = base * multiplier;
            if (value >= min && value <= max && value < Math.pow(10, power + 1)) {
                ticks.push(value);
            }
        }
    }
    
    // Always include the actual min and max if they're not already included
    if (!ticks.includes(min)) ticks.unshift(min);
    if (!ticks.includes(max)) ticks.push(max);
    
    return ticks.sort((a, b) => a - b);
};

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

    // Get metric type from context if available (when used with LineDataProvider)
    let metricType: string = "Probability";
    try {
        const lineDataContext = useLineData();
        metricType = lineDataContext.metricType === Metrics.RANK ? "Rank" : "Probability";
    } catch {
        // useLineData will throw if not within provider (e.g., PendingLine)
        // Default to "Probability"
    }

    // Generate log tick values for rank charts (for y-axis labels only)
    const logTickValues = useMemo(() => {
        return metricType === "Rank" ? generateLogTickValues(yRange[0], yRange[1]) : null;
    }, [metricType, yRange]);

    // Adjust margin for rank charts to provide extra top space for x-axis
    const adjustedMargin = useMemo(() => {
        if (metricType === "Rank") {
            return {
                ...margin,
                top: margin.top + 40, // Add extra top margin for rank charts with legend
            };
        }
        return margin;
    }, [margin, metricType]);

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
                    margin={adjustedMargin}
                    yScale={{
                        type: metricType === "Rank" ? 'log' : 'linear',
                        min: yRange[0],
                        max: yRange[1],
                        stacked: false,
                        reverse: metricType === "Rank", // Flip y-axis for rank (lower ranks at top)
                        nice: false, // Use exact min/max values without padding
                    }}
                    axisTop={metricType === "Rank" ? {
                        legend: 'Layer',
                        legendOffset: -35,
                        tickSize: 0,
                        tickPadding: 10,
                        tickRotation: 0,
                    } : null}
                    axisBottom={metricType === "Rank" ? null : {
                        legend: 'Layer',
                        legendOffset: 35,
                        tickSize: 0,
                        tickPadding: 10,
                        tickRotation: 0,
                    }}
                    axisLeft={{
                        legend: metricType,
                        legendOffset: -50,
                        tickSize: 0,
                        tickPadding: 10,
                        tickRotation: 0,
                        ...(logTickValues && {
                            tickValues: logTickValues
                        })
                    }}
                    theme={resolvedTheme}
                    colors={colorFn}
                    enableGridX={false}
                    isInteractive={false}
                    yFormat={metricType === "Rank" ? ">-.0f" : ">-.2f"}
                    animate={false}
                    crosshairType="x"
                    enableSlices={false}
                    useMesh={false}
                    enableGridY={true}
                    gridYValues={logTickValues || undefined}
                    enablePoints={false}
                    pointBorderWidth={0}
                />
            </div>
        </div>
    );
}