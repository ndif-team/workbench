"use client";

import { useMemo } from "react";
import { ResponsiveHeatMapCanvas } from "@nivo/heatmap";
import { heatmapMargin, heatmapTheme } from "../theming";
import { resolveThemeCssVars } from "@/lib/utils";
import { Margin } from "@nivo/core";
import { HeatmapRow } from "@/types/charts";
import { Tooltip } from "./Tooltip";
import { Metrics } from "@/types/lens";
import React from "react";

interface HeatmapProps {
    rows: HeatmapRow[];
    margin?: Margin;
    heatmapCanvasRef?: React.RefObject<HTMLCanvasElement>;
    useTooltip?: boolean;
    onMouseMove?: (e: React.MouseEvent) => void;
    onMouseLeave?: () => void;
    onMouseDown?: (e: React.MouseEvent<any>) => void;
    statisticType?: Metrics;
}

export function Heatmap({
    rows,
    margin = heatmapMargin,
    heatmapCanvasRef,
    useTooltip = false,
    onMouseMove = () => {},
    onMouseLeave = () => {},
    onMouseDown = () => {},
    statisticType,
}: HeatmapProps) {
    const resolvedTheme = useMemo(() => resolveThemeCssVars(heatmapTheme), []);

    // Create a lookup map to access right_axis_label by row.id
    const rightAxisLabelMap = useMemo(() => {
        const labelMap: Record<string, string> = {};
        if (statisticType !== Metrics.PROBABILITY) {
            rows.forEach((row) => {
                labelMap[row.id] = row.right_axis_label ?? "";
            });
        }
        return labelMap;
    }, [rows, statisticType]);

    const minValue = useMemo(() => {
        if (statisticType === Metrics.PROBABILITY) {
            return 0;
        } else {
            return rows.reduce((globalMin, row) => {
                return Math.min(
                    globalMin,
                    row.data.reduce((rowMin, cell) => {
                        return Math.min(rowMin, cell.y ?? Infinity);
                    }, Infinity),
                );
            }, Infinity);
        }
    }, [rows, statisticType]);

    const maxValue = useMemo(() => {
        if (statisticType === Metrics.PROBABILITY) {
            return 1;
        } else {
            return rows.reduce((globalMax, row) => {
                return Math.max(
                    globalMax,
                    row.data.reduce((rowMax, cell) => {
                        return Math.max(rowMax, cell.y ?? -Infinity);
                    }, -Infinity),
                );
            }, -Infinity);
        }
    }, [rows, statisticType]);

    return (
        <div
            className="size-full relative cursor-crosshair"
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseLeave={onMouseLeave}
        >
            <canvas
                ref={heatmapCanvasRef}
                className="absolute inset-0 size-full pointer-events-auto z-20"
            />
            {useTooltip && <Tooltip />}
            <ResponsiveHeatMapCanvas
                data={rows}
                margin={margin}
                valueFormat=">-.2f"
                axisTop={null}
                axisBottom={{
                    legend: "Layer",
                    legendOffset: 40,
                    tickSize: 0,
                    tickPadding: 10,
                    format: (value) => String(value),
                }}
                axisLeft={{
                    tickSize: 0,
                    tickPadding: 10,
                    format: (value) => String(value).replace(/-\d+$/, ""),
                }}
                axisRight={
                    statisticType !== Metrics.PROBABILITY
                        ? {
                              tickSize: 0,
                              tickPadding: 10,
                              format: (value) => {
                                  // Access rightAxisLabel using the lookup map
                                  return (
                                      rightAxisLabelMap[value] || String(value).replace(/-\d+$/, "")
                                  );
                              },
                          }
                        : null
                }
                label={(cell) => {
                    if (cell.data.label) {
                        return cell.data.label;
                    }
                    return "";
                }}
                labelTextColor={(cell) => {
                    // Use white text for dark cells, black for light cells
                    const value = cell.data.y;
                    return value !== null && value > 0.5 ? "#ffffff" : "#000000";
                }}
                colors={{
                    type: "sequential",
                    scheme: "blues",
                    minValue: minValue,
                    maxValue: maxValue,
                }}
                hoverTarget="cell"
                inactiveOpacity={1}
                theme={resolvedTheme}
                animate={false}
                isInteractive={false}
                legends={[
                    {
                        title: statisticType === Metrics.RANK ? "Rank (log)" : statisticType,
                        anchor: "right",
                        translateX: statisticType !== Metrics.PROBABILITY ? 60 : 30,
                        translateY: 0,
                        length: 400,
                        thickness: 8,
                        direction: "column",
                        tickPosition: "after",
                        tickSize: 3,
                        tickSpacing: 4,
                        tickOverlap: false,
                        tickFormat: ">-.2f",
                        titleAlign: "start",
                    },
                ]}
            />
        </div>
    );
}
