import { useAnnotations } from "@/stores/useAnnotations";
import { useWorkspace } from "@/stores/useWorkspace";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, RefObject } from "react";
import { getAnnotations } from "@/lib/queries/annotationQueries";
import { HeatmapAnnotation } from "@/types/annotations";
import { HeatmapData } from "@/types/charts";
import { heatmapMargin as margin } from "../theming";

interface SelectionRect {
    startX: number
    startY: number
    endX: number
    endY: number
}

interface UseSelectionClickProps {
    canvasRef: RefObject<HTMLCanvasElement>
    data: HeatmapData
    mode?: "annotation" | "zoom"
    enabled?: boolean
    onZoomComplete?: (bounds: { minRow: number, maxRow: number, minCol: number, maxCol: number }) => void
}

const useSelectionClick = ({ canvasRef, data, mode = 'annotation', enabled = true, onZoomComplete }: UseSelectionClickProps) => {
    const { pendingAnnotation, setPendingAnnotation } = useAnnotations()
    const [isSelecting, setIsSelecting] = useState(false)
    const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null)
    const animationFrameRef = useRef<number>()

    const { activeTab: chartId } = useWorkspace();

    const { data: allAnnotations } = useQuery({
        queryKey: ["annotations", chartId],
        queryFn: () => getAnnotations(chartId as string),
        enabled: !!chartId,
    });

    useEffect(() => {
        console.log("allAnnotations", allAnnotations)
    }, [allAnnotations])

    const annotations: HeatmapAnnotation[] = allAnnotations?.filter(a => a.type === "heatmap").map(a => a.data as HeatmapAnnotation) || []

    useEffect(() => {   
        if (!pendingAnnotation || pendingAnnotation.type !== 'heatmap') {
            setSelectionRect(null)
        }
    }, [pendingAnnotation])

    // Calculate cell dimensions based on canvas size and data
    const getCellDimensions = useCallback(() => {
        if (!canvasRef.current || !data.rows.length || !data.rows[0].data.length) {
            return null
        }

        const canvas = canvasRef.current
        const width = canvas.offsetWidth
        const height = canvas.offsetHeight

        const gridWidth = width - margin.left - margin.right
        const gridHeight = height - margin.top - margin.bottom

        const numCols = data.rows[0].data.length
        const numRows = data.rows.length

        const cellWidth = gridWidth / numCols
        const cellHeight = gridHeight / numRows

        return {
            cellWidth,
            cellHeight,
            gridWidth,
            gridHeight,
            numCols,
            numRows
        }
    }, [data.rows, margin.top, margin.right, margin.bottom, margin.left])

    // Convert mouse position to cell indices
    const getCellFromPosition = useCallback((x: number, y: number) => {
        const dims = getCellDimensions()
        if (!dims) return null

        const gridX = x - margin.left
        const gridY = y - margin.top

        if (gridX < 0 || gridY < 0 || gridX >= dims.gridWidth || gridY >= dims.gridHeight) {
            return null
        }

        const col = Math.floor(gridX / dims.cellWidth)
        const row = Math.floor(gridY / dims.cellHeight)

        if (col >= 0 && col < dims.numCols && row >= 0 && row < dims.numRows) {
            return { col, row }
        }

        return null
    }, [getCellDimensions, margin.left, margin.top])

    // Helper function to get bounding box from cell IDs
    const getCellBounds = useCallback((cellIds: string[]) => {
        let minRow = Infinity, maxRow = -Infinity
        let minCol = Infinity, maxCol = -Infinity
        
        cellIds.forEach(cellId => {
            const parts = cellId.split('-')
            if (parts.length >= 3) {
                const row = parseInt(parts[parts.length - 2])
                const col = parseInt(parts[parts.length - 1])
                
                if (!isNaN(row) && !isNaN(col)) {
                    minRow = Math.min(minRow, row)
                    maxRow = Math.max(maxRow, row)
                    minCol = Math.min(minCol, col)
                    maxCol = Math.max(maxCol, col)
                }
            }
        })
        
        return minRow !== Infinity ? { minRow, maxRow, minCol, maxCol } : null
    }, [])

    // Helper function to draw a bounding rectangle
    const drawBoundingRect = useCallback((
        ctx: CanvasRenderingContext2D,
        bounds: { minRow: number, maxRow: number, minCol: number, maxCol: number },
        dims: { cellWidth: number, cellHeight: number },
        style: { fillStyle: string, strokeStyle: string, lineWidth: number }
    ) => {
        const x = margin.left + bounds.minCol * dims.cellWidth
        const y = margin.top + bounds.minRow * dims.cellHeight
        const width = (bounds.maxCol - bounds.minCol + 1) * dims.cellWidth
        const height = (bounds.maxRow - bounds.minRow + 1) * dims.cellHeight
        
        ctx.fillStyle = style.fillStyle
        ctx.strokeStyle = style.strokeStyle
        ctx.lineWidth = style.lineWidth
        
        ctx.fillRect(x, y, width, height)
        ctx.strokeRect(x, y, width, height)
    }, [margin])

    // Draw selection on canvas
    const drawSelection = useCallback(() => {
        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')
        if (!canvas || !ctx) return

        const dims = getCellDimensions()
        if (!dims) return

        // Clear canvas (accounting for device pixel ratio)
        const dpr = window.devicePixelRatio || 1
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)

        // Draw existing annotations
        if (annotations && chartId) {
            annotations.forEach(annotation => {
                if (Array.isArray(annotation.cellIds) && annotation.cellIds.length > 0) {
                    const bounds = getCellBounds(annotation.cellIds)
                    if (bounds) {
                        drawBoundingRect(ctx, bounds, dims, {
                            fillStyle: 'rgba(255, 0, 0, 0.2)',
                            strokeStyle: 'red',
                            lineWidth: 2
                        })
                    }
                }
            })
        }

        // Draw current selection rectangle
        if (selectionRect) {
            const bounds = {
                minCol: Math.min(selectionRect.startX, selectionRect.endX),
                maxCol: Math.max(selectionRect.startX, selectionRect.endX),
                minRow: Math.min(selectionRect.startY, selectionRect.endY),
                maxRow: Math.max(selectionRect.startY, selectionRect.endY)
            }
            
            drawBoundingRect(ctx, bounds, dims, {
                fillStyle: 'rgba(59, 130, 246, 0.3)',
                strokeStyle: '#3b82f6',
                lineWidth: 2
            })
        }
    }, [selectionRect, getCellDimensions, annotations, chartId, getCellBounds, drawBoundingRect])

    // Handle canvas resize with proper DPI scaling
    useEffect(() => {
        const updateCanvasSize = () => {
            if (canvasRef.current) {
                const dpr = window.devicePixelRatio || 1
                const rect = canvasRef.current.getBoundingClientRect()
                
                // Set internal size to actual size multiplied by DPR
                canvasRef.current.width = rect.width * dpr
                canvasRef.current.height = rect.height * dpr
                
                // Scale the drawing context to match the device pixel ratio
                const ctx = canvasRef.current.getContext('2d')
                if (ctx) {
                    ctx.scale(dpr, dpr)
                }
                
                drawSelection()
            }
        }

        updateCanvasSize()
        window.addEventListener('resize', updateCanvasSize)
        return () => window.removeEventListener('resize', updateCanvasSize)
    }, [drawSelection])

    // Redraw when selection changes
    useEffect(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current)
        }
        animationFrameRef.current = requestAnimationFrame(() => {
            drawSelection()
        })
    }, [selectionRect, drawSelection])

    // Handle click from Nivo canvas
    const handleCellClick = useCallback((cell: any) => {
        if (!enabled) return
        if (!chartId) return

        // Extract row and column indices from the cell data
        const rowIndex = data.rows.findIndex(r => r.id === cell.serieId)
        const colIndex = cell.data.x
        
        if (rowIndex === -1 || colIndex === undefined) return

        if (!isSelecting) {
            // Start new selection
            setIsSelecting(true)
            setSelectionRect({
                startX: colIndex,
                startY: rowIndex,
                endX: colIndex,
                endY: rowIndex
            })
        } else if (selectionRect) {
            // Finalize selection
            const minCol = Math.min(selectionRect.startX, colIndex)
            const maxCol = Math.max(selectionRect.startX, colIndex)
            const minRow = Math.min(selectionRect.startY, rowIndex)
            const maxRow = Math.max(selectionRect.startY, rowIndex)

            if (mode === 'zoom') {
                onZoomComplete?.({ minRow, maxRow, minCol, maxCol })
                setIsSelecting(false)
                setSelectionRect(null)
                return
            }

            const cells = new Set<string>()
            for (let row = minRow; row <= maxRow; row++) {
                for (let col = minCol; col <= maxCol; col++) {
                    cells.add(`${chartId}-${row}-${col}`)
                }
            }

            setPendingAnnotation({
                type: "heatmap",
                cellIds: Array.from(cells),
                text: ""
            })
            // setSelectionRect(null)
            setIsSelecting(false)
        }
    }, [selectionRect, data.rows, chartId, setPendingAnnotation, mode, enabled, onZoomComplete])

    // Handle mouse move on the container (for selection preview)
    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!enabled) return
        if (!isSelecting || !selectionRect) return

        const rect = canvasRef.current?.getBoundingClientRect()
        if (!rect) return

        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        const cell = getCellFromPosition(x, y)

        if (cell) {
            setSelectionRect(prev => prev ? {
                ...prev,
                endX: cell.col,
                endY: cell.row
            } : null)
        }
    }, [selectionRect, getCellFromPosition, enabled, isSelecting])

    return {
        handleCellClick,
        handleMouseMove,
    }
}

export default useSelectionClick