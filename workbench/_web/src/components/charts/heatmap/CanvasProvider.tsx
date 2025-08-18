import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useHeatmapData } from "./HeatmapDataProvider";
import { heatmapMargin as margin } from "../theming";
import { HeatmapBounds } from "@/types/charts";
import { useDpr } from "../useDpr";
import { getCellFromPosition, getCellDimensions } from "./heatmap-geometry";

interface CanvasContextValue {
    selectionCanvasRef: React.RefObject<HTMLCanvasElement>
    rafRef: React.MutableRefObject<number | null>
    draw: (bounds: HeatmapBounds) => void
    clear: () => void
}

interface Tooltip {
    visible: boolean
    left: number
    top: number
    xVal: string | number
    yVal: number | null
    color: string
    topTokens?: { token: string; prob: number }[]
}

const CanvasContext = createContext<CanvasContextValue | null>(null)

export const useCanvasProvider = () => {
    const ctx = useContext(CanvasContext)
    if (!ctx) throw new Error("useCanvasProvider must be used within a CanvasProvider")
    return ctx
}

export const CanvasProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const selectionCanvasRef = useRef<HTMLCanvasElement>(null)
    const { filteredData: data } = useHeatmapData()
    const rafRef = useRef<number | null>(null)

    // DPR/resize handling
    useDpr(selectionCanvasRef)

    // DRAWING

    const clear = useCallback(() => {
        const canvas = selectionCanvasRef.current
        const ctx = canvas?.getContext('2d')
        if (!canvas || !ctx) return
        ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
    }, [])

    const draw = useCallback((bounds: HeatmapBounds) => {
        const canvas = selectionCanvasRef.current
        const ctx = canvas?.getContext('2d')
        if (!canvas || !ctx) return
        ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
        const dims = getCellDimensions(selectionCanvasRef, data)
        if (!dims) return
        const minCol = Math.min(bounds.minCol, bounds.maxCol)
        const maxCol = Math.max(bounds.minCol, bounds.maxCol)
        const minRow = Math.min(bounds.minRow, bounds.maxRow)
        const maxRow = Math.max(bounds.minRow, bounds.maxRow)
        const x = margin.left + minCol * dims.cellWidth
        const y = margin.top + minRow * dims.cellHeight
        const w = (maxCol - minCol + 1) * dims.cellWidth
        const h = (maxRow - minRow + 1) * dims.cellHeight
        ctx.fillStyle = 'rgba(239,68,68,0.25)'
        ctx.strokeStyle = '#ef4444'
        ctx.lineWidth = 1
        ctx.fillRect(x, y, w, h)
        const sx = x + 0.5
        const sy = y + 0.5
        const sw = Math.max(0, w - 1)
        const sh = Math.max(0, h - 1)
        ctx.strokeRect(sx, sy, sw, sh)
    }, [data])

    const contextValue: CanvasContextValue = {
        selectionCanvasRef,
        rafRef,
        draw,
        clear,
    }

    // TOOLTIP DRAWING

    const [tooltip, setTooltip] = useState<Tooltip>(
        { visible: false, left: 0, top: 0, xVal: "", yVal: null, color: "transparent" }
    )

    const valueToBlue = (value: number | null) => {
        if (value === null || Number.isNaN(value)) return "#cccccc"
        const v = Math.max(0, Math.min(1, value))
        const lightness = 90 - v * 60
        return `hsl(217 91% ${lightness}%)`
    }

    const handleMove = useCallback((e: MouseEvent) => {
        const canvasRect = selectionCanvasRef.current?.getBoundingClientRect()
        if (!canvasRect) return setTooltip(prev => prev.visible ? { ...prev, visible: false } : prev)

        const x = e.clientX - canvasRect.left
        const y = e.clientY - canvasRect.top

        // Get cell dimensions to calculate effective grid bounds
        const dims = getCellDimensions(selectionCanvasRef, data)
        if (!dims) {
            return setTooltip(prev => prev.visible ? { ...prev, visible: false } : prev)
        }

        // Check if cursor is within the grid area (excluding margins)
        const withinGrid = (
            x >= margin.left &&
            x < margin.left + dims.gridWidth &&
            y >= margin.top &&
            y < margin.top + dims.gridHeight
        )
        if (!withinGrid) {
            return setTooltip(prev => prev.visible ? { ...prev, visible: false } : prev)
        }

        const cell = getCellFromPosition(selectionCanvasRef, data, x, y)
        if (!cell) {
            setTooltip(prev => prev.visible ? { ...prev, visible: false } : prev)
            return
        }
        const firstRow = data.rows[0]
        const xVal = firstRow?.data[cell.col]?.x ?? ""
        const cellData = data.rows[cell.row]?.data[cell.col]
        const yVal = cellData?.y ?? null
        const topTokens = cellData?.topTokens
        const color = valueToBlue(typeof yVal === 'number' ? yVal : null)
        const left = e.clientX + 12
        const top = e.clientY - 12
        setTooltip({ visible: true, left, top, xVal, yVal, color, topTokens })
    }, [selectionCanvasRef, data])

    const handleLeave = useCallback(() => {
        setTooltip(prev => prev.visible ? { ...prev, visible: false } : prev)
    }, [])

    useEffect(() => {
        const canvasElement = selectionCanvasRef.current
        if (!canvasElement) return
        canvasElement.addEventListener('mousemove', handleMove)
        canvasElement.addEventListener('mouseleave', handleLeave)
        return () => {
            canvasElement.removeEventListener('mousemove', handleMove)
            canvasElement.removeEventListener('mouseleave', handleLeave)
        }
    }, [handleMove, handleLeave])

    return (
        <CanvasContext.Provider value={contextValue}>
            {tooltip.visible && (
                <div
                    className="fixed z-30 px-2 py-1 rounded shadow bg-background border text-sm pointer-events-none"
                    style={{ left: tooltip.left, top: tooltip.top }}
                >
                    <div className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: tooltip.color }} />
                        <span>x: {String(tooltip.xVal)}</span>
                        <span>y: {tooltip.yVal === null ? '—' : tooltip.yVal.toFixed(2)}</span>
                    </div>
                    {tooltip.topTokens && tooltip.topTokens.length > 0 && (
                        <div className="mt-1">
                            {tooltip.topTokens.slice(0, 5).map((t, i) => (
                                <div key={i} className="flex justify-between gap-3">
                                    <span className="font-mono">{t.token.replace(/\s/g, '\u2423')}</span>
                                    <span>{t.prob.toFixed(3)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {children}
        </CanvasContext.Provider>
    )
}