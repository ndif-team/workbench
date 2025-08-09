import { useState, useMemo, useEffect } from "react";
import { Heatmap } from "./Heatmap";
import { HeatmapData } from "@/types/charts";
import { RangeSelector } from "../RangeSelector";
import { Button } from "@/components/ui/button";
import { Search, RotateCcw } from "lucide-react";
import { useAnnotations } from "@/stores/useAnnotations";
import { useLensWorkspace } from "@/stores/useLensWorkspace";

type Range = [number, number];
type RangeWithId = {
    id: string;
    range: Range;
};

interface HeatmapCardProps {
    data: HeatmapData
}


export const HeatmapCard = ({ data }: HeatmapCardProps) => {
    const [title, setTitle] = useState("");
    const [isEditingTitle, setIsEditingTitle] = useState(false);

    const [xRanges, setXRanges] = useState<RangeWithId[]>([]);
    const [yRanges, setYRanges] = useState<RangeWithId[]>([]);

    const [isZoomSelecting, setIsZoomSelecting] = useState(false);

    const { setPendingAnnotation } = useAnnotations();
    const { tokenData } = useLensWorkspace();

    // Calculate the bounds for the range selectors
    const xMax = useMemo(() => {
        if (!data.rows.length || !data.rows[0].data.length) return 100;
        return data.rows[0].data.length - 1;
    }, [data]);

    const yMax = useMemo(() => {
        if (!data.rows.length) return 100;
        return data.rows.length - 1;
    }, [data]);

    const xMin = 0;
    const yMin = 0;

    // X range step input (default to 10 segments)
    const defaultXStep = useMemo(() => {
        const width = xMax - xMin;
        return Math.max(1, Math.floor(width / 10));
    }, [xMax, xMin]);
    const [xStepInput, setXStepInput] = useState<number>(defaultXStep);

    useEffect(() => {
        // Initialize default when ranges are empty and step hasn't been set yet
        if (xRanges.length === 0) {
            setXStepInput(defaultXStep);
        }
    }, [defaultXStep]);

    const sanitizedXStep = Number.isFinite(xStepInput) && xStepInput > 0 ? xStepInput : 1;

    // Default Y to last 10 tokens when empty
    useEffect(() => {
        if (yRanges.length === 0 && yMax >= 0) {
            const start = Math.max(yMin, yMax - 9);
            const end = yMax;
            setYRanges([{ id: `y-default-${Date.now()}`, range: [start, end] }]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [yMax]);

    // Filter the heatmap data based on selected ranges and apply stepping
    const filteredData = useMemo(() => {
        const xRange = xRanges[0]?.range || [xMin, xMax];
        const yRange = yRanges[0]?.range || [yMin, yMax];
        const stride = Math.max(1, Math.floor(sanitizedXStep));

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
    }, [data, xRanges, yRanges, xMin, xMax, yMin, yMax, sanitizedXStep]);

    const handleZoomComplete = (bounds: { minRow: number, maxRow: number, minCol: number, maxCol: number }) => {
        const hasX = xRanges.length > 0;
        const hasY = yRanges.length > 0;

        const xOffset = 0;
        const yOffset = hasY ? Math.floor(yRanges[0].range[0]) : 0;

        const absMinCol = Math.max(xMin, Math.min(xMax, xOffset + bounds.minCol));
        const absMaxCol = Math.max(xMin, Math.min(xMax, xOffset + bounds.maxCol));
        const absMinRow = Math.max(yMin, Math.min(yMax, yOffset + bounds.minRow));
        const absMaxRow = Math.max(yMin, Math.min(yMax, yOffset + bounds.maxRow));

        const currentX = hasX ? xRanges[0].range : [xMin, xMax] as Range;
        const currentY = hasY ? yRanges[0].range : [yMin, yMax] as Range;

        const newX: Range = [
            Math.max(currentX[0], Math.min(absMinCol, absMaxCol)),
            Math.min(currentX[1], Math.max(absMinCol, absMaxCol))
        ];
        const newY: Range = [
            Math.max(currentY[0], Math.min(absMinRow, absMaxRow)),
            Math.min(currentY[1], Math.max(absMinRow, absMaxRow))
        ];

        setXRanges([{ id: `x-zoom-${Date.now()}`, range: newX }]);
        setYRanges([{ id: `y-zoom-${Date.now()}`, range: newY }]);

        setIsZoomSelecting(false);
    };

    const handleReset = () => {
        setXRanges([]);
        setYRanges([]);
        setIsZoomSelecting(false);
        setPendingAnnotation(null);
        // reset step to default showing at most 10 layers
        setXStepInput(defaultXStep);
    };

    const formatYValue = (v: number) => {
        const token = tokenData?.[v]?.text ?? "";
        return token ? `${token} (${v})` : String(v);
    };

    return (
        <div className="flex flex-col h-full m-2 border rounded bg-muted">
            <div className="flex h-[10%] gap-2 p-4 lg:p-8 justify-between">
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
                    />
                ) : (
                    <h1 
                        className="text-xl font-bold cursor-pointer border rounded border-transparent w-64 overflow-clip items-center flex hover:border-border transition-opacity p-0 m-0"
                        onClick={() => setIsEditingTitle(true)}
                    >
                        {title || "Untitled Chart"}
                    </h1>
                )}



                <div className="flex items-center gap-2">
                    <RangeSelector
                        min={xMin}
                        max={xMax}
                        ranges={xRanges}
                        onRangesChange={setXRanges}
                        maxRanges={1}
                        axisLabel="X Range"
                        step={sanitizedXStep}
                    />
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            min={1}
                            max={Math.max(1, xMax - xMin)}
                            step={1}
                            value={xStepInput}
                            onChange={(e) => {
                                const val = Number(e.target.value);
                                if (Number.isNaN(val)) {
                                    setXStepInput(1);
                                } else {
                                    setXStepInput(Math.max(1, Math.min(val, Math.max(1, xMax - xMin))))
                                }
                            }}
                            className="w-20 h-8 border rounded px-2 text-xs bg-background"
                            aria-label="X Range Step"
                            title="X Range Step"
                        />
                    </div>

                    <RangeSelector
                        min={yMin}
                        max={yMax}
                        ranges={yRanges}
                        onRangesChange={setYRanges}
                        maxRanges={1}
                        axisLabel="Y Range"
                        formatValue={formatYValue}
                    />

                    <Button
                        variant={isZoomSelecting ? "default" : "outline"}
                        size="icon"
                        onClick={() => {
                            const next = !isZoomSelecting;
                            setIsZoomSelecting(next);
                            if (next) {
                                // Disable annotation creation while zooming
                                setPendingAnnotation(null);
                            }
                        }}
                        aria-pressed={isZoomSelecting}
                        title={isZoomSelecting ? "Exit zoom selection" : "Enter zoom selection"}
                    >
                        <Search className="w-4 h-4" />
                    </Button>

                    <Button
                        variant="outline"
                        size="icon"
                        onClick={handleReset}
                        title="Reset ranges"
                    >
                        <RotateCcw className="w-4 h-4" />
                    </Button>
                </div>
            </div>
            <div className="flex h-[90%] w-full">
                <Heatmap
                    data={filteredData}
                    selectionMode={isZoomSelecting ? 'zoom' : 'annotation'}
                    selectionEnabled={true}
                    onZoomComplete={handleZoomComplete}
                />
            </div>
        </div>
    )
}

