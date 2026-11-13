"use client";

import { useToolArea } from "@/hooks/useToolArea";
import { cn } from "@/lib/utils";
import { LogitLensControls } from "./LogitLensControls";
import type { LogitLensData } from "nnsightful";
import { LogitLensConfigData } from "@/types/logitLens";
import { finalPrediction } from "@/lib/lens-last-row";

interface LogitLensConfig {
    id: string;
    data: LogitLensConfigData;
    type: string;
}

interface LogitLensChart {
    id: string;
    data: LogitLensData | null;
    type: string;
}

/**
 * The chart's controls: the side panel, or on a phone (`layout="floating"`)
 * the composer floating over the chart.
 */
export default function LogitLensArea({ layout = "panel" }: { layout?: "panel" | "floating" }) {
    const {
        config,
        chart,
        isChartLoading,
        modelsAvailable,
        modelsFetching,
        effectiveModel,
        hasExistingData,
        modelRunnable,
    } = useToolArea<LogitLensConfig, LogitLensChart>();

    if (!config || isChartLoading) {
        if (layout === "floating") return null;
        return (
            <div className="h-full flex flex-col md:min-w-64">
                <div className="p-3 border-b flex items-center justify-between">
                    <h2 className="text-sm pl-2 font-medium">Logit Lens</h2>
                </div>
                <div className="h-48 animate-pulse bg-muted/50 m-3 rounded" />
            </div>
        );
    }

    return (
        <div className={cn(layout === "panel" && "h-full flex flex-col md:min-w-64")}>
            <LogitLensControls
                key={config.id}
                initialConfig={config}
                selectedModel={effectiveModel}
                // Treat a non-runnable (cold/gone) saved model as read-only,
                // reusing the existing models-unavailable path. The saved
                // result still renders read-only in the Display.
                modelsAvailable={modelsAvailable && modelRunnable}
                modelsLoading={modelsFetching}
                hasExistingData={hasExistingData}
                layout={layout}
                nextToken={finalPrediction(chart?.data)}
            />
        </div>
    );
}
