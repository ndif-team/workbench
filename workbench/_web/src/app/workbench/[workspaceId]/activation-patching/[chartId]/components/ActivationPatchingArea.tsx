"use client";

import { useToolArea } from "@/hooks/useToolArea";
import { ActivationPatchingControls } from "./ActivationPatchingControls";
import {
    ActivationPatchingConfigData,
    ActivationPatchingData,
} from "@/types/activationPatching";

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

export default function ActivationPatchingArea() {
    const {
        config,
        isChartLoading,
        modelsAvailable,
        modelsFetching,
        effectiveModel,
        hasExistingData,
    } = useToolArea<ActivationPatchingConfig, ActivationPatchingChart>();

    if (!config || isChartLoading) {
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
        <div className="h-full flex flex-col md:min-w-64">
            <ActivationPatchingControls
                key={config.id}
                initialConfig={config}
                selectedModel={effectiveModel}
                modelsAvailable={modelsAvailable}
                modelsLoading={modelsFetching}
                hasExistingData={hasExistingData}
            />
        </div>
    );
}
