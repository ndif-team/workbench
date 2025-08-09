"use client";

import { useMemo, useRef } from 'react'
import { ResponsiveHeatMapCanvas } from '@nivo/heatmap'
import { HeatmapData } from '@/types/charts'
import { heatmapTheme, heatmapMargin } from '../theming'
import { resolveThemeCssVars } from '@/lib/utils'
import useSelectionClick from './SelectionLayer';


interface HeatmapProps {
    data: HeatmapData
    selectionMode?: 'annotation' | 'zoom'
    selectionEnabled?: boolean
    onZoomComplete?: (bounds: { minRow: number, maxRow: number, minCol: number, maxCol: number }) => void
}

export function Heatmap({
    data,
    selectionMode = 'annotation',
    selectionEnabled = true,
    onZoomComplete,
}: HeatmapProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)

    const { handleCellClick, handleMouseMove } = useSelectionClick({ canvasRef, data, mode: selectionMode, enabled: selectionEnabled, onZoomComplete })

    // Resolve all CSS variables in the theme to concrete colors for Canvas compatibility
    const resolvedTheme = useMemo(() => resolveThemeCssVars(heatmapTheme), [])
    
    return (
        <div 
            className="size-full relative"
            onMouseMove={handleMouseMove}
        >
            <canvas
                ref={canvasRef}
                className="absolute inset-0 size-full pointer-events-none z-10"
            />
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