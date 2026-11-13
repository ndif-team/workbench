"use client";

import { useToolArea } from "@/hooks/useToolArea";
import { cn } from "@/lib/utils";
import { JLensControls } from "./JLensControls";
import { JLensConfigData, JLensData } from "@/types/jlens";

interface JLensConfig {
    id: string;
    data: JLensConfigData;
    type: string;
}

interface JLensChart {
    id: string;
    data: JLensData | null;
    type: string;
}

/**
 * The chart's controls: the side panel, or on a phone (`layout="floating"`)
 * the composer floating over the chart.
 */
export default function JLensArea({ layout = "panel" }: { layout?: "panel" | "floating" }) {
    const {
        config,
        isChartLoading,
        modelsAvailable,
        modelsFetching,
        effectiveModel,
        hasExistingData,
        modelRunnable,
        isModelSupported,
    } = useToolArea<JLensConfig, JLensChart>();

    if (!config || isChartLoading) {
        if (layout === "floating") return null;
        return (
            <div className="h-full flex flex-col md:min-w-64">
                <div className="p-3 border-b flex items-center justify-between">
                    <h2 className="text-sm pl-2 font-medium">J-Lens</h2>
                </div>
                <div className="h-48 animate-pulse bg-muted/50 m-3 rounded" />
            </div>
        );
    }

    return (
        <div className={cn(layout === "panel" && "h-full flex flex-col md:min-w-64")}>
            <JLensControls
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
                // j-lens only supports models that have a Jacobian lens; when
                // the active model doesn't, the controls grey out and invite a
                // model change (the picker also disables such models).
                modelSupported={isModelSupported}
            />
        </div>
    );
}
