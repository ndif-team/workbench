"use client";

import { useMemo } from 'react'
import { ResponsiveHeatMapCanvas } from '@nivo/heatmap'
import { heatmapTheme, heatmapMargin } from '../theming'
import { resolveThemeCssVars } from '@/lib/utils'
import { useCanvas } from './CanvasProvider';
import { useHeatmapControls } from './HeatmapControlsProvider';


export function Heatmap() {
    // Resolve all CSS variables in the theme to concrete colors for Canvas compatibility
    const resolvedTheme = useMemo(() => resolveThemeCssVars(heatmapTheme), [])
    const { handleCellClick } = useCanvas()
    const { filteredData: data } = useHeatmapControls()

    return (
        <div data-testid="heatmap-canvas" aria-label="Heatmap Canvas" style={{ width: '100%', height: '100%' }}>
            <ResponsiveHeatMapCanvas
                data={data.rows}
                margin={heatmapMargin}
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
                onClick={handleCellClick}
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
        </div>
    )
}