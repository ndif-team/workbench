"use client";

import { useMemo } from 'react'
import { ResponsiveHeatMapCanvas } from '@nivo/heatmap'
import { heatmapMargin, heatmapTheme } from '../theming'
import { resolveThemeCssVars } from '@/lib/utils'
import { Margin } from '@nivo/core';
import { HeatmapData } from '@/types/charts';
import { HeatmapTooltip } from './HeatmapTooltip';


interface HeatmapProps {
    data: HeatmapData;
    margin?: Margin;
    onClick?: (cell: any) => void;  
}


export function Heatmap({ data, margin = heatmapMargin, onClick = () => {} }: HeatmapProps) {
    // Resolve all CSS variables in the theme to concrete colors for Canvas compatibility
    const resolvedTheme = useMemo(() => resolveThemeCssVars(heatmapTheme), [])

    return (

        <ResponsiveHeatMapCanvas
            data={data.rows}
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
            label={(cell) => cell.data.label || ''}
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
            onClick={onClick}
            tooltip={HeatmapTooltip}
            legends={[
                {
                    anchor: 'right',
                    translateX: 30,
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
    )
}