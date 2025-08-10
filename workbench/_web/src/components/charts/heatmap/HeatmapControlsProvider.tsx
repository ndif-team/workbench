import React, { createContext, useContext, useState, useMemo, useEffect, ReactNode } from "react";
import { HeatmapData } from "@/types/charts";
import { useAnnotations } from "@/stores/useAnnotations";
import { Button } from "@/components/ui/button";
import { RangeSelector } from "../RangeSelector";
import { Search, RotateCcw } from "lucide-react";


type Range = [number, number];
type RangeWithId = {
    id: string;
    range: Range;
};

export interface ZoomBounds {
    minRow: number;
    maxRow: number;
    minCol: number;
    maxCol: number;
}

export interface Bounds {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
}

interface HeatmapControlsContextValue {
    // Range State
    xRanges: RangeWithId[];
    yRanges: RangeWithId[];
    setXRanges: (ranges: RangeWithId[]) => void;
    setYRanges: (ranges: RangeWithId[]) => void;

    // Step State
    xStepInput: number;
    setXStepInput: (step: number) => void;

    // Computed Values
    bounds: Bounds;
    filteredData: HeatmapData;

    // Zoom State
    isZoomSelecting: boolean;
    setIsZoomSelecting: (selecting: boolean) => void;
    toggleZoomSelecting: (next?: boolean) => void;
    handleZoomComplete: (bounds: ZoomBounds) => void;
}

const HeatmapControlsContext = createContext<HeatmapControlsContextValue | null>(null);

export const useHeatmapControls = () => {
    const context = useContext(HeatmapControlsContext);
    if (!context) {
        throw new Error("useHeatmapControls must be used within a HeatmapControlsProvider");
    }
    return context;
};

interface HeatmapControlsProviderProps {
    data: HeatmapData;
    children: ReactNode;
}

export const HeatmapControlsProvider: React.FC<HeatmapControlsProviderProps> = ({ data, children }) => {
    // Calculate bounds
    const bounds = useMemo(() => {
        const xMax = data.rows.length && data.rows[0].data.length ? data.rows[0].data.length - 1 : 100;
        const yMax = data.rows.length ? data.rows.length - 1 : 100;
        return {
            xMin: 0,
            yMin: 0,
            xMax,
            yMax,
        };
    }, [data]);

    // Range State
    const [xRanges, setXRanges] = useState<RangeWithId[]>([]);
    const [yRanges, setYRanges] = useState<RangeWithId[]>([]);

    // Calculate default step
    const defaultXStep = useMemo(() => {
        const width = bounds.xMax - bounds.xMin;
        return Math.max(1, Math.floor(width / 10));
    }, [bounds.xMax, bounds.xMin]);

    // Step State
    const [xStepInput, setXStepInput] = useState<number>(defaultXStep);

    // Update step when default changes
    useEffect(() => {
        if (xRanges.length === 0) {
            setXStepInput(defaultXStep);
        }
    }, [defaultXStep, xRanges.length]);

    // Auto-initialize Y range to last 10 tokens
    useEffect(() => {
        if (yRanges.length === 0 && bounds.yMax >= 0) {
            const start = Math.max(bounds.yMin, bounds.yMax - 9);
            const end = bounds.yMax;
            setYRanges([{ id: `y-default-${Date.now()}`, range: [start, end] }]);
        }
    }, [bounds.yMax, bounds.yMin, yRanges.length]);

    // Filter data based on ranges and stepping
    const filteredData = useMemo(() => {
        const xRange = xRanges[0]?.range || [bounds.xMin, bounds.xMax];
        const yRange = yRanges[0]?.range || [bounds.yMin, bounds.yMax];
        const stride = Math.max(1, Math.floor(xStepInput));

        return {
            ...data,
            rows: data.rows
                .map((row, yIndex) => {
                    // Check if this row index is within Y range
                    const inYRange = yIndex >= yRange[0] && yIndex <= yRange[1];
                    if (!inYRange) return null;

                    // Apply X range filtering and stepping
                    const filteredAndSampled = row.data
                        .map((cell, idx) => ({ cell, idx }))
                        .filter(({ idx }) => {
                            // First check if within X range
                            const inXRange = idx >= xRange[0] && idx <= xRange[1];
                            if (!inXRange) return false;
                            // Then apply stepping (take every Nth element)
                            const relativeIdx = idx - xRange[0];
                            return relativeIdx % stride === 0;
                        })
                        .map(({ cell }) => cell);

                    return {
                        ...row,
                        data: filteredAndSampled
                    };
                })
                .filter(row => row !== null) as typeof data.rows
        };
    }, [data, xRanges, yRanges, bounds.xMin, bounds.xMax, bounds.yMin, bounds.yMax, xStepInput]);


    // ZOOM STATE

    // Zoom State
    const [isZoomSelecting, setIsZoomSelecting] = useState(false);

    const computeNewRanges = (zoomBounds: ZoomBounds) => {
        const hasX = xRanges.length > 0;
        const hasY = yRanges.length > 0;

        const xOffset = 0;
        const yOffset = hasY ? Math.floor(yRanges[0].range[0]) : 0;

        const absMinCol = Math.max(bounds.xMin, Math.min(bounds.xMax, xOffset + zoomBounds.minCol));
        const absMaxCol = Math.max(bounds.xMin, Math.min(bounds.xMax, xOffset + zoomBounds.maxCol));
        const absMinRow = Math.max(bounds.yMin, Math.min(bounds.yMax, yOffset + zoomBounds.minRow));
        const absMaxRow = Math.max(bounds.yMin, Math.min(bounds.yMax, yOffset + zoomBounds.maxRow));

        const currentX = hasX ? xRanges[0].range : [bounds.xMin, bounds.xMax] as Range;
        const currentY = hasY ? yRanges[0].range : [bounds.yMin, bounds.yMax] as Range;

        const newX: Range = [
            Math.max(currentX[0], Math.min(absMinCol, absMaxCol)),
            Math.min(currentX[1], Math.max(absMinCol, absMaxCol))
        ];
        const newY: Range = [
            Math.max(currentY[0], Math.min(absMinRow, absMaxRow)),
            Math.min(currentY[1], Math.max(absMinRow, absMaxRow))
        ];

        return {
            newX,
            newY
        }
    }

    // Handle zoom completion
    const handleZoomComplete = (zoomBounds: ZoomBounds) => {
        const { newX, newY } = computeNewRanges(zoomBounds);

        setXRanges([{ id: `x-zoom-${Date.now()}`, range: newX }]);
        setYRanges([{ id: `y-zoom-${Date.now()}`, range: newY }]);

        setIsZoomSelecting(false);
    };

    const toggleZoomSelecting = (next?: boolean) => {
        const value = typeof next === "boolean" ? next : !isZoomSelecting;
        setIsZoomSelecting(value);
    };

    const { setPendingAnnotation } = useAnnotations();

    // Handle reset
    const handleReset = () => {
        setXRanges([]);
        setYRanges([]);
        setIsZoomSelecting(false);
        setPendingAnnotation(null);
        setXStepInput(1);
    };

    const [title, setTitle] = useState("");
    const [isEditingTitle, setIsEditingTitle] = useState(false);


    const contextValue: HeatmapControlsContextValue = {
        // Range State
        xRanges,
        yRanges,
        setXRanges,
        setYRanges,

        // Step State
        xStepInput,
        setXStepInput,

        // Computed Values
        bounds,
        filteredData,

        // Zoom State
        isZoomSelecting,
        setIsZoomSelecting,
        toggleZoomSelecting,
        handleZoomComplete,
    };

    return (
        <HeatmapControlsContext.Provider value={contextValue}>
            <div className="flex h-[10%] gap-2 p-4 lg:p-8 justify-between" data-testid="heatmap-controls">
                {isEditingTitle ? (
                    <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        onBlur={() => setIsEditingTitle(false)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                setIsEditingTitle(false);
                            }
                        }}
                        placeholder="Untitled Chart"
                        className="text-xl font-bold p-0 m-0 border-primary border overflow-clip rounded bg-transparent w-64"
                        autoFocus
                        aria-label="Chart Title"
                    />
                ) : (
                    <h1
                        className="text-xl font-bold cursor-pointer border rounded border-transparent w-64 overflow-clip items-center flex hover:border-border transition-opacity p-0 m-0"
                        onClick={() => setIsEditingTitle(true)}
                        data-testid="chart-title"
                    >
                        {title || "Untitled Chart"}
                    </h1>
                )}
                <div className="flex items-center gap-2">
                    <RangeSelector
                        min={bounds.xMin}
                        max={bounds.xMax}
                        ranges={xRanges}
                        onRangesChange={setXRanges}
                        maxRanges={1}
                        axisLabel="X Range"
                        step={xStepInput}
                    />
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            min={1}
                            max={Math.max(1, bounds.xMax - bounds.xMin)}
                            step={1}
                            value={xStepInput}
                            onChange={(e) => {
                                const val = Number(e.target.value);
                                if (Number.isNaN(val)) {
                                    setXStepInput(1);
                                } else {
                                    setXStepInput(Math.max(1, Math.min(val, Math.max(1, bounds.xMax - bounds.xMin))));
                                }
                            }}
                            className="w-20 h-8 border rounded px-2 text-xs bg-background"
                            aria-label="X Range Step"
                            title="X Range Step"
                            data-testid="x-range-step"
                        />
                    </div>

                    <RangeSelector
                        min={bounds.yMin}
                        max={bounds.yMax}
                        ranges={yRanges}
                        onRangesChange={setYRanges}
                        maxRanges={1}
                        axisLabel="Y Range"
                    />

                    <Button
                        variant={isZoomSelecting ? "default" : "outline"}
                        size="icon"
                        onClick={() => toggleZoomSelecting()}
                        aria-pressed={isZoomSelecting}
                        title={isZoomSelecting ? "Exit zoom selection" : "Enter zoom selection"}
                        data-testid="zoom-toggle"
                        aria-label="Toggle Zoom Selection"
                    >
                        <Search className="w-4 h-4" />
                    </Button>

                    <Button variant="outline" size="icon" onClick={handleReset} title="Reset ranges" data-testid="reset-ranges" aria-label="Reset Ranges">
                        <RotateCcw className="w-4 h-4" />
                    </Button>
                </div>
            </div>
            {children}
        </HeatmapControlsContext.Provider>
    );
};
