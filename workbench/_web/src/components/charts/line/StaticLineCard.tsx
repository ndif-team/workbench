import React from "react";
import { Line } from "./Line";
import { LineDataProvider, useLineData } from "./LineDataProvider";
import { LineChart } from "@/db/schema";
import { LineCanvasProvider, useLineCanvas } from "./LineCanvasProvider";
import { useLensWorkspace } from "@/stores/useLensWorkspace";
import { useCrosshair } from "./useCrosshair";
import { LineHoverProvider, useLineHover } from "./LineHoverProvider";
import { useAnnotationSelection } from "./useAnnotationSelection";
import { ViewProvider } from "../ViewProvider";
import { LensLineMetrics } from "@/types/lens";


interface StaticLineCardProps {
    chart: LineChart;
    metricType?: LensLineMetrics;
}

export const StaticLineCard = ({ chart, metricType }: StaticLineCardProps) => {
    return (
        <div className="h-full rounded bg-card">
            <ViewProvider chartId={chart.id}>
                <LineDataProvider chart={chart} metricType={metricType}>
                    <LineCanvasProvider>
                        <LineHoverProvider>
                            <StaticLine />
                        </LineHoverProvider>
                    </LineCanvasProvider>
                </LineDataProvider>
            </ViewProvider>
        </div>
    )
}

const StaticLine = () => {
    // Provider context hooks
    const { lines, yRange } = useLineData();
    const { rafRef, lineCanvasRef } = useLineCanvas();
    const { handleMouseMove, handleMouseLeave } = useLineHover();

    // Enable legend highlighting
    const { highlightedLineIds } = useLensWorkspace();

    // Draw vertical crosshair
    const { crosshairCanvasRef } = useCrosshair({ rafRef });

    // Enable default annotation selection
    useAnnotationSelection();

    return (
        <Line
            lines={lines}
            yRange={yRange}
            highlightedLineIds={highlightedLineIds}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            lineCanvasRef={lineCanvasRef}
            crosshairCanvasRef={crosshairCanvasRef}
            useTooltip={true}
        />
    );
}