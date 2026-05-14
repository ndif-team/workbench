"use client";

import { useToolArea } from "@/hooks/useToolArea";
import { Lens2Controls } from "./Lens2Controls";
import { Lens2ConfigData, Lens2Data } from "@/types/lens2";

interface Lens2Config {
    id: string;
    data: Lens2ConfigData;
    type: string;
}

interface Lens2Chart {
    id: string;
    data: Lens2Data | null;
    type: string;
}

export default function Lens2Area() {
    const {
        config,
        isChartLoading,
        modelsAvailable,
        modelsFetching,
        effectiveModel,
        hasExistingData,
    } = useToolArea<Lens2Config, Lens2Chart>();

    if (!config || isChartLoading) {
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
        <div className="h-full flex flex-col md:min-w-64">
            <Lens2Controls
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
