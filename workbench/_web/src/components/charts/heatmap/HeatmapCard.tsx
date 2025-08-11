import React, { type RefObject } from "react";
import { Heatmap } from "./Heatmap";
import { HeatmapData } from "@/types/charts";
import { HeatmapControlsProvider } from "./HeatmapControlsProvider";
import { CanvasProvider } from "./CanvasProvider";

interface HeatmapCardProps {
    data: HeatmapData;
    captureRef?: RefObject<HTMLDivElement>;
    chartId?: string;
    initialName?: string;
}

export const HeatmapCard = ({ data, captureRef, chartId, initialName }: HeatmapCardProps) => {
    return (
        <div className="flex flex-col h-full m-2 border rounded bg-muted">
            <HeatmapControlsProvider data={data} chartId={chartId} initialName={initialName}>
                <div className="flex h-[90%] w-full" ref={captureRef}>
                    <CanvasProvider>
                        <Heatmap />
                    </CanvasProvider>
                </div>
            </HeatmapControlsProvider>
        </div>
    );
};
