import React, { useRef } from "react";
import { Heatmap } from "./Heatmap";
import { HeatmapData } from "@/types/charts";
import { HeatmapControlsProvider } from "./HeatmapControlsProvider";
import { CanvasProvider } from "./CanvasProvider";
import { Button } from "@/components/ui/button";
import { toPng } from "html-to-image";

interface HeatmapCardProps {
    data: HeatmapData
    chartId: string;
    initialTitle?: string;
}

export const HeatmapCard = ({ data, chartId, initialTitle = "" }: HeatmapCardProps) => {
    const captureRef = useRef<HTMLDivElement | null>(null);

    const handleExportPng = async () => {
        if (!captureRef.current) return;
        try {
            const dataUrl = await toPng(captureRef.current, {
                cacheBust: true,
                backgroundColor: getComputedStyle(document.documentElement).getPropertyValue("--background") || "#ffffff",
                pixelRatio: 2,
            });
            const link = document.createElement("a");
            link.download = `${(data as any).title || "chart"}.png`;
            link.href = dataUrl;
            link.click();
        } catch (err) {
            console.error("Failed to export PNG", err);
        }
    };

    return (
        <div className="flex flex-col h-full m-2 border rounded bg-muted">
            <HeatmapControlsProvider data={data} chartId={chartId} initialTitle={initialTitle}>
                <div className="flex h-[90%] w-full flex-col">
                    <div className="px-4 lg:px-8 pb-2 flex items-center justify-end">
                        <Button variant="outline" size="sm" onClick={handleExportPng}>Export PNG</Button>
                    </div>
                    <div className="flex-1" ref={captureRef}>
                        <CanvasProvider>
                            <Heatmap />
                        </CanvasProvider>
                    </div>
                </div>
            </HeatmapControlsProvider>
        </div>
    );
};
