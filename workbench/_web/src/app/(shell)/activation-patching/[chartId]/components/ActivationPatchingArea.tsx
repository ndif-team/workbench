"use client";

import { useToolArea } from "@/hooks/useToolArea";
import { cn } from "@/lib/utils";
import { ActivationPatchingControls } from "./ActivationPatchingControls";
import { ActivationPatchingConfigData, ActivationPatchingData } from "@/types/activationPatching";

interface ActivationPatchingConfig {
    id: string;
    data: ActivationPatchingConfigData;
    type: string;
}

interface ActivationPatchingChart {
    id: string;
    data: ActivationPatchingData | null;
    type: string;
}

/**
 * The chart's controls: the side panel, or on a phone (`layout="floating"`)
 * the composer fixed under the chart.
 */
export default function ActivationPatchingArea({
    layout = "panel",
}: {
    layout?: "panel" | "floating";
}) {
    const {
        config,
        isChartLoading,
        models,
        modelsAvailable,
        modelsFetching,
        effectiveModel,
        hasExistingData,
        modelRunnable,
    } = useToolArea<ActivationPatchingConfig, ActivationPatchingChart>();
    const looped = models?.find((m) => m.name === effectiveModel)?.looped === true;

    if (!config || isChartLoading) {
        if (layout === "floating") return null;
        return (
            <div className="h-full flex flex-col md:min-w-64">
                <div className="p-3 border-b flex items-center justify-between">
                    <h2 className="text-sm pl-2 font-medium">Activation Patching</h2>
                </div>
                <div className="h-48 animate-pulse bg-muted/50 m-3 rounded" />
            </div>
        );
    }

    return (
        <div className={cn(layout === "panel" && "h-full flex flex-col md:min-w-64")}>
            <ActivationPatchingControls
                key={config.id}
                initialConfig={config}
                selectedModel={effectiveModel}
                looped={looped}
                // Cold/gone saved model → read-only (reuses the existing
                // models-unavailable path); the saved result still renders.
                modelsAvailable={modelsAvailable && modelRunnable}
                modelsLoading={modelsFetching}
                hasExistingData={hasExistingData}
                layout={layout}
            />
        </div>
    );
}
