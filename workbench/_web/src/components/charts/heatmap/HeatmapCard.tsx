import { type RefObject } from "react";
import { Heatmap } from "./Heatmap";
import { HeatmapDataProvider, useHeatmapData } from "./HeatmapDataProvider";
import { HeatmapChart } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Crop, RotateCcw } from "lucide-react";
import { HeatmapCanvasProvider, useHeatmapCanvas } from "./HeatmapCanvasProvider";
import { HeatmapHoverProvider, useHeatmapHover } from "./HeatmapHoverProvider";
import { useSelection } from "./useSelection";
import { useAnnotationSelection } from "./useAnnotationSelection";
import { Separator } from "@/components/ui/separator";
import CodeExport from "@/app/workbench/[workspaceId]/components/CodeExport";
import { CopyImage } from "../CopyImage";

interface HeatmapCardProps {
    chart: HeatmapChart;
    pending: boolean;
    captureRef?: RefObject<HTMLDivElement>;
}

export const HeatmapCard = ({ chart, captureRef, pending }: HeatmapCardProps) => {
    return (
        <div className="flex size-full flex-col">
            {pending ? (
                <PendingHeatmap />
            ) : (
                <HeatmapDataProvider chart={chart}>
                    <HeatmapCanvasProvider>
                        <HeatmapHoverProvider>
                            <HeatmapCardContent captureRef={captureRef} chart={chart} />
                        </HeatmapHoverProvider>
                    </HeatmapCanvasProvider>
                </HeatmapDataProvider>
            )}
        </div>
    );
};

const PendingHeatmap = () => {
    return (
        <div className="flex flex-col size-full relative">
            <div className="flex h-[10%] gap-3 items-center p-4 lg:p-8 justify-end">
                <input
                    disabled
                    className="w-20 h-8 border rounded px-3 text-xs bg-background"
                />
                <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8"
                    disabled
                >
                    <Crop className="w-4 h-4" />
                </Button>

                <Button variant="outline" size="sm" className="h-8 w-8" disabled>
                    <RotateCcw className="w-4 h-4" />
                </Button>
            </div>

            <div className="flex h-[90%] w-full">
                <Heatmap rows={[]} />
            </div>

            <div className="absolute inset-0 z-30 overflow-hidden pointer-events-none">
                <div className="absolute inset-0 w-full h-full animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent" />
            </div>
        </div>
    )
}

interface HeatmapCardContentProps {
    captureRef?: RefObject<HTMLDivElement>;
    chart: HeatmapChart;
}

const HeatmapCardContent = ({ captureRef, chart }: HeatmapCardContentProps) => {
    const { filteredData: data, bounds, xStep, handleStepChange, setXRange, setYRange, setXStep, defaultXStep } = useHeatmapData()
    const { zoomIntoActiveSelection, clearSelection, activeSelection, onMouseDown } = useSelection()
    const { heatmapCanvasRef } = useHeatmapCanvas()
    const { handleMouseMove, handleMouseLeave } = useHeatmapHover()
    useAnnotationSelection()

    // Handle reset: clear selection and reset ranges/step
    const handleReset = async () => {
        await clearSelection()
        setXRange([bounds.minCol, bounds.maxCol]);
        const start = Math.max(bounds.minRow, bounds.maxRow - 9);
        setYRange([start, bounds.maxRow]);
        setXStep(defaultXStep);
    }

    return (
        <div className="flex flex-col size-full">
            <div className="flex px-3 py-3 items-center justify-between border-b">
                <div className="flex items-center gap-2">
                    <CodeExport chartId={chart?.id} chartType={chart?.type as ("line" | "heatmap" | null | undefined)} />
                    <CopyImage />
                </div>
                <div className="flex gap-2 items-center">
                    <span className="text-sm">X-Step:</span>
                    <input
                        type="number"
                        min={1}
                        max={Math.max(1, bounds.maxCol - bounds.minCol)}
                        step={1}
                        value={xStep}
                        onChange={handleStepChange}
                        className="w-18 h-8 border rounded px-3 text-xs bg-background "
                        aria-label="X Range Step"
                        title="X Range Step"
                    />
                    {/* <Separator orientation="vertical" className="wjhite" /> */}
                    <Button
                        variant={activeSelection ? "default" : "outline"}
                        size="sm"
                        className="h-8 w-8"
                        onClick={() => { void zoomIntoActiveSelection() }}
                        disabled={!activeSelection}
                        title={activeSelection ? "Zoom into selection and clear annotation" : "Draw a selection on the chart first"}
                    >
                        <Crop className="w-4 h-4" />
                    </Button>

                    <Button variant="outline" size="sm" className="h-8 w-8" onClick={() => { void handleReset() }} title="Reset zoom and clear selection">
                        <RotateCcw className="w-4 h-4" />
                    </Button>
                </div>
            </div>
            <div className="flex size-full" ref={captureRef}>
                <Heatmap
                    rows={data}
                    heatmapCanvasRef={heatmapCanvasRef}
                    useTooltip={true}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                    onMouseDown={onMouseDown}
                />
            </div>
        </div>
    )
}