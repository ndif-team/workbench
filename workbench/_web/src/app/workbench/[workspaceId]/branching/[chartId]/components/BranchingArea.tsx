"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ModelSelector } from "@/components/ModelSelector";
import { useWorkspace } from "@/stores/useWorkspace";
import { getChartById, getConfigForChart } from "@/lib/queries/chartQueries";
import { getModels } from "@/lib/api/modelsApi";
import { queryKeys } from "@/lib/queryKeys";
import { BranchingControls } from "./BranchingControls";
import type { BranchingConfigData } from "@/types/branching";

export default function BranchingArea() {
    const { chartId } = useParams<{ chartId: string }>();

    const { data: configRow } = useQuery({
        queryKey: queryKeys.charts.configByChart(chartId),
        queryFn: () => getConfigForChart(chartId as string),
        enabled: !!chartId,
    });
    const { data: models } = useQuery({
        queryKey: ["models"],
        queryFn: getModels,
        refetchInterval: 120000,
    });

    const { selectedModelIdx, setSelectedModelIdx } = useWorkspace();
    const [unavailable, setUnavailable] = useState<string | null>(null);

    const config = configRow?.data as BranchingConfigData | undefined;

    useEffect(() => {
        if (config?.model && models && models.length > 0) {
            const idx = models.findIndex((m) => m.name === config.model);
            if (idx !== -1) {
                setSelectedModelIdx(idx);
                setUnavailable(null);
            } else {
                setUnavailable(config.model);
            }
        }
    }, [config?.model, models, setSelectedModelIdx]);

    const selectedModel = useMemo(() => {
        if (!models || models.length === 0) return undefined;
        return models[selectedModelIdx]?.name ?? models[0].name;
    }, [models, selectedModelIdx]);

    if (!config || !selectedModel) {
        return (
            <div className="h-full flex flex-col md:min-w-64">
                <div className="p-3 border-b flex items-center justify-between">
                    <h2 className="text-sm pl-2 font-medium">Branching</h2>
                    <ModelSelector />
                </div>
                <div className="h-48 animate-pulse bg-muted/50 m-3 rounded" />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col md:min-w-64">
            <div className="p-3 border-b flex items-center justify-between">
                <h2 className="text-sm pl-2 font-medium">Branching</h2>
                <div className="flex items-center gap-2">
                    {unavailable && (
                        <span
                            className="text-xs text-yellow-500"
                            title={`Model "${unavailable}" not currently available`}
                        >
                            ⚠
                        </span>
                    )}
                    <ModelSelector />
                </div>
            </div>
            <div className="p-3 flex-1 overflow-auto">
                <BranchingControls
                    chartId={chartId as string}
                    initialConfig={config}
                    selectedModel={selectedModel}
                />
            </div>
        </div>
    );
}
