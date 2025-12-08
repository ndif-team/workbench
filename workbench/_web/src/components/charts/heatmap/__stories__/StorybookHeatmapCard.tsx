"use client";

import { type RefObject } from "react";
import { Heatmap } from "../Heatmap";
import { Button } from "@/components/ui/button";
import { Crop, RotateCcw } from "lucide-react";
import { MockHeatmapCanvasProvider, useHeatmapCanvas } from "./MockHeatmapCanvasProvider";
import { MockHeatmapHoverProvider, useHeatmapHover } from "./MockHeatmapHoverProvider";
import { Separator } from "@/components/ui/separator";
import { Metrics } from "@/types/lens";
import { MockViewProvider } from "./MockViewProvider";
import { MockHeatmapDataProvider, useMockHeatmapData } from "./MockHeatmapDataProvider";
import { useMockSelection } from "./useMockSelection";
import { useMockAnnotationSelection } from "./useMockAnnotationSelection";
import { HeatmapViewData } from "@/types/charts";
import { MockHeatmapChart } from "./mockData";
import { Margin } from "@nivo/core";
import { StorybookTokenPopover } from "./StorybookTokenPopover";

// Default margin for Storybook - larger margins to show axis labels
const storybookMargin: Margin = { top: 10, right: 90, bottom: 70, left: 80 };

interface StorybookHeatmapCardProps {
    chart: MockHeatmapChart;
    pending?: boolean;
    captureRef?: RefObject<HTMLDivElement>;
    statisticType?: Metrics;
    initialViewData?: Partial<HeatmapViewData>;
    margin?: Margin;
}

/**
 * Storybook version of HeatmapCard that uses mock providers
 * for standalone UI development without backend dependencies
 */
export const StorybookHeatmapCard = ({
    chart,
    captureRef,
    pending = false,
    statisticType = Metrics.PROBABILITY,
    initialViewData,
    margin = storybookMargin,
}: StorybookHeatmapCardProps) => {
    return (
        <div className="flex size-full flex-col">
            {pending ? (
                <PendingHeatmap />
            ) : (
                <MockViewProvider chartId={chart.id} initialViewData={initialViewData}>
                    <MockHeatmapDataProvider chart={chart}>
                        <MockHeatmapCanvasProvider>
                            <MockHeatmapHoverProvider>
                                <StorybookHeatmapCardContent
                                    captureRef={captureRef}
                                    statisticType={statisticType}
                                    margin={margin}
                                />
                            </MockHeatmapHoverProvider>
                        </MockHeatmapCanvasProvider>
                    </MockHeatmapDataProvider>
                </MockViewProvider>
            )}
        </div>
    );
};

const PendingHeatmap = () => {
    return (
        <div className="flex flex-col size-full">
            <div className="flex px-3 py-3 items-center justify-between border-b">
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled>
                        Export
                    </Button>
                    <Button variant="outline" size="sm" disabled>
                        Copy
                    </Button>
                </div>
                <div className="flex gap-2 items-center">
                    <span className="text-sm">X-Step:</span>
                    <input
                        type="number"
                        min={1}
                        className="w-18 h-8 border rounded px-3 text-xs bg-background"
                        aria-label="X Range Step"
                        title="X Range Step"
                        disabled
                    />
                    <Separator orientation="vertical" className="h-6" />
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8"
                        disabled
                        title="Zoom into selection"
                    >
                        <Crop className="w-4 h-4" />
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8"
                        disabled
                        title="Reset zoom"
                    >
                        <RotateCcw className="w-4 h-4" />
                    </Button>
                </div>
            </div>
            <div className="flex size-full relative">
                <Heatmap rows={[]} statisticType={Metrics.PROBABILITY} />

                <div className="absolute inset-0 z-30 overflow-hidden pointer-events-none">
                    <div className="absolute inset-0 w-full h-full animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                </div>
            </div>
        </div>
    );
};

interface StorybookHeatmapCardContentProps {
    captureRef?: RefObject<HTMLDivElement>;
    statisticType?: Metrics;
    margin?: Margin;
}

const StorybookHeatmapCardContent = ({
    captureRef,
    statisticType,
    margin = storybookMargin,
}: StorybookHeatmapCardContentProps) => {
    const {
        filteredData: data,
        bounds,
        xStep,
        handleStepChange,
        setXRange,
        setYRange,
        setXStep,
        defaultXStep,
    } = useMockHeatmapData();
    const { zoomIntoActiveSelection, clearSelection, activeSelection, onMouseDown } =
        useMockSelection();
    const { heatmapCanvasRef } = useHeatmapCanvas();
    const { handleMouseMove, handleMouseLeave } = useHeatmapHover();
    useMockAnnotationSelection();

    // Handle reset: clear selection and reset ranges/step
    const handleReset = async () => {
        await clearSelection();
        setXRange([bounds.minCol, bounds.maxCol]);
        setYRange([bounds.minRow, bounds.maxRow]);
        setXStep(defaultXStep);
    };

    return (
        <div className="flex flex-col size-full">
            <div className="flex px-3 py-3 items-center justify-between border-b">
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm">
                        Export
                    </Button>
                    <Button variant="outline" size="sm">
                        Copy
                    </Button>
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
                        className="w-18 h-8 border rounded px-3 text-xs bg-background"
                        aria-label="X Range Step"
                        title="X Range Step"
                    />
                    <Separator orientation="vertical" className="h-6" />
                    <Button
                        variant={activeSelection ? "default" : "outline"}
                        size="sm"
                        className="h-8 w-8"
                        onClick={() => {
                            void zoomIntoActiveSelection();
                        }}
                        disabled={!activeSelection}
                        title={
                            activeSelection
                                ? "Zoom into selection"
                                : "Draw a selection first"
                        }
                    >
                        <Crop className="w-4 h-4" />
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8"
                        onClick={() => {
                            void handleReset();
                        }}
                        title="Reset zoom and clear selection"
                    >
                        <RotateCcw className="w-4 h-4" />
                    </Button>
                </div>
            </div>
            <div className="flex size-full" ref={captureRef}>
                <Heatmap
                    rows={data}
                    heatmapCanvasRef={heatmapCanvasRef}
                    useTooltip={true}
                    tooltipComponent={<StorybookTokenPopover />}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                    onMouseDown={onMouseDown}
                    statisticType={statisticType}
                    margin={margin}
                />
            </div>
        </div>
    );
};

export default StorybookHeatmapCard;
