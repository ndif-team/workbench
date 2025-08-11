import React from "react";
import { Heatmap } from "./Heatmap";
import { HeatmapData } from "@/types/charts";
import { HeatmapControlsProvider } from "./HeatmapControlsProvider";
import { CanvasProvider } from "./CanvasProvider";

interface HeatmapCardProps {
    data: HeatmapData
    chartId: string;
    initialTitle?: string;
}

export const HeatmapCard = ({ data, chartId, initialTitle = "" }: HeatmapCardProps) => {
    return (
        <div className="flex flex-col h-full m-2 border rounded bg-muted">
            <HeatmapControlsProvider data={data} chartId={chartId} initialTitle={initialTitle}>
                <div className="flex h-[90%] w-full">
                    <CanvasProvider>
                        <Heatmap />
                    </CanvasProvider>
                </div>
            </HeatmapControlsProvider>
        </div>
    );
};
