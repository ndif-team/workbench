"use client";

import { useMemo } from 'react'
import { ResponsiveHeatMapCanvas } from '@nivo/heatmap'
import { heatmapMargin, heatmapTheme } from '../theming'
import { resolveThemeCssVars } from '@/lib/utils'
import { Margin } from '@nivo/core';
import { HeatmapRow } from '@/types/charts';
import { Tooltip } from './Tooltip';
import { LensStatistic } from '@/types/lens';


interface HeatmapProps {
    rows: HeatmapRow[]
    margin?: Margin;
    heatmapCanvasRef?: React.RefObject<HTMLCanvasElement>;
    useTooltip?: boolean;
    onMouseMove?: (e: React.MouseEvent) => void;
    onMouseLeave?: () => void;
    onMouseDown?: (e: React.MouseEvent<any>) => void;
    statisticType?: LensStatistic;
}


export function Heatmap({
    rows,
    margin = heatmapMargin,
    heatmapCanvasRef,
    useTooltip = false,
    onMouseMove = () => { },
    onMouseLeave = () => { },
    onMouseDown = () => { },
    statisticType
}: HeatmapProps) {
    const resolvedTheme = useMemo(() => resolveThemeCssVars(heatmapTheme), [])

    // Create a lookup map to access right_axis_label by row.id
    const rightAxisLabelMap = useMemo(() => {
        const labelMap: Record<string, string> = {};
        rows.forEach((row) => {
            // Use the right_axis_label from HeatmapRow, fallback to cleaned id
            labelMap[row.id] = row.data[row.data.length - 1]?.label || String(row.id).replace(/-\d+$/, '');
        });
        return labelMap;
    }, [rows])

    return (
        <div className="size-full relative cursor-crosshair"
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseLeave={onMouseLeave}>
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
                    legend: 'Layer',
                    legendOffset: 40,
                    tickSize: 0,
                    tickPadding: 10,
                    format: (value) => String(value),
                }}
                axisLeft={{
                    tickSize: 0,
                    tickPadding: 10,
                    format: (value) => String(value).replace(/-\d+$/, ''),
                }}
                axisRight={statisticType !== LensStatistic.PROBABILITY ? {
                    tickSize: 0,
                    tickPadding: 10,
                    format: (value) => {
                        // Access rightAxisLabel using the lookup map
                        return rightAxisLabelMap[value].replace(/-\d+$/, '') || String(value).replace(/-\d+$/, '');
                    },
                } : null}
                label={(cell) => {
                    if (cell.data.label) {
                        return cell.data.label;
                    }
                    return '';
                }}
                labelTextColor={(cell) => {
                    // Use white text for dark cells, black for light cells
                    const value = cell.data.y
                    return value !== null && value > 0.5 ? '#ffffff' : '#000000'
                }}
                colors={{
                    type: 'sequential',
                    scheme: 'blues',
                    minValue: 0,
                    maxValue: 1
                }}
                hoverTarget="cell"
                inactiveOpacity={1}
                theme={resolvedTheme}
                animate={false}
                isInteractive={false}
                legends={[
                    {
                        anchor: 'right',
                        translateX: statisticType !== LensStatistic.PROBABILITY ? 60 : 30,
                        translateY: 0,
                        length: 400,
                        thickness: 8,
                        direction: 'column',
                        tickPosition: 'after',
                        tickSize: 3,
                        tickSpacing: 4,
                        tickOverlap: false,
                        tickFormat: '>-.2f',
                        titleAlign: 'start',
                    }
                ]}
            />
        </div>
    )
}