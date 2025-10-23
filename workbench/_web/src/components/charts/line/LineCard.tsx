import React, { type RefObject } from "react";
import { Line } from "./Line";
import { LineDataProvider, useLineData } from "./LineDataProvider";
import { LineChart } from "@/db/schema";
import { LensLineMetrics } from "@/types/lens";
import { LineCanvasProvider, useLineCanvas } from "./LineCanvasProvider";
import { useLensWorkspace } from "@/stores/useLensWorkspace";
import { Button } from "@/components/ui/button";
import { Crop, RotateCcw } from "lucide-react";
import { useSelection } from "./useSelection";
import { useCrosshair } from "./useCrosshair";
import { useLineClick } from "./useLineClick";
import { LineHoverProvider, useLineHover } from "./LineHoverProvider";
import { useAnnotationSelection } from "./useAnnotationSelection";
import CodeExport from "@/app/workbench/[workspaceId]/components/CodeExport";
import { CopyImage } from "../CopyImage";

interface LineCardProps {
    chart: LineChart;
    pending: boolean;
    captureRef: RefObject<HTMLDivElement>;
    metricType?: LensLineMetrics;
}

export const LineCard = ({ chart, captureRef, pending, metricType }: LineCardProps) => {
    return (
        <div className="flex flex-col size-full">
            {pending ? (
                <PendingLine chart={chart} />
            ) : (
                <LineDataProvider chart={chart} metricType={metricType}>
                    <LineCanvasProvider>
                        <LineHoverProvider>
                            <InteractiveLine captureRef={captureRef} chart={chart} />
                        </LineHoverProvider>
                    </LineCanvasProvider>
                </LineDataProvider>
            )}
        </div>
    );
};

const PendingLine = ({ chart }: { chart: LineChart }) => {
    return (
        <div className="flex flex-col size-full">
            <div className="flex px-3 py-3 items-center justify-between border-b">
                <div className="flex items-center gap-2">
                    <CodeExport
                        chartId={chart?.id}
                        chartType={chart?.type as "line" | "heatmap" | null | undefined}
                    />
                    <CopyImage />
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8"
                        disabled
                        title="Zoom into selection and clear selection"
                    >
                        <Crop className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8"
                        title="Reset zoom and clear selection"
                    >
                        <RotateCcw className="w-4 h-4" />
                    </Button>
                </div>
            </div>
            <div className="flex size-full pt-4 relative">
                <Line lines={[]} />

                <div className="absolute inset-0 z-30 overflow-hidden pointer-events-none">
                    <div className="absolute inset-0 w-full h-full animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                </div>
            </div>
        </div>
    );
};

const InteractiveLine = ({
    captureRef,
    chart,
}: {
    captureRef: RefObject<HTMLDivElement>;
    chart: LineChart;
}) => {
    // Provider context hooks
    const { lines, yRange } = useLineData();
    const { rafRef, lineCanvasRef, activeSelection } = useLineCanvas();
    const { handleMouseMove, handleMouseLeave } = useLineHover();

    // Enable legend highlighting
    const { highlightedLineIds, toggleLineHighlight, clearHighlightedLineIds } = useLensWorkspace();

    // Draw vertical crosshair
    const { crosshairCanvasRef } = useCrosshair({ rafRef });

    // Enable line click
    const { handleClick } = useLineClick();

    // Enable drag selection
    const { handleMouseDown, zoomIntoActiveSelection, resetZoom, didDragRef } = useSelection();

    // Enable default annotation selection
    useAnnotationSelection();

    const onClick = (e: React.MouseEvent) => {
        if (didDragRef.current) {
            didDragRef.current = false;
            return;
        }
        handleClick(e);
    };

    const handleReset = async () => {
        await resetZoom();
        clearHighlightedLineIds();
    };

    return (
        <div className="flex flex-col size-full">
            <div className="flex px-3 py-3 items-center justify-between border-b">
                <div className="flex items-center gap-2">
                    <CodeExport
                        chartId={chart?.id}
                        chartType={chart?.type as "line" | "heatmap" | null | undefined}
                    />
                    <CopyImage />
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant={activeSelection ? "default" : "outline"}
                        size="sm"
                        className="h-8 w-8"
                        onClick={() => {
                            void zoomIntoActiveSelection(activeSelection);
                        }}
                        disabled={!activeSelection}
                        title={
                            activeSelection
                                ? "Zoom into selection and clear selection"
                                : "Draw a selection on the chart first"
                        }
                    >
                        <Crop className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8"
                        onClick={handleReset}
                        title="Reset zoom and clear selection"
                    >
                        <RotateCcw className="w-4 h-4" />
                    </Button>
                </div>
            </div>
            <div className="flex size-full pt-4" ref={captureRef}>
                <Line
                    lines={lines}
                    yRange={yRange}
                    onLegendClick={toggleLineHighlight}
                    highlightedLineIds={highlightedLineIds}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                    onClick={onClick}
                    lineCanvasRef={lineCanvasRef}
                    crosshairCanvasRef={crosshairCanvasRef}
                    useTooltip={true}
                />
            </div>
        </div>
    );
};
