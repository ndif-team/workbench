"use client";

import { ModelSelector } from "@/components/ModelSelector";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { getModels } from "@/lib/api/modelsApi";
import { queryKeys } from "@/lib/queryKeys";
import { getChartById, getConfigForChart } from "@/lib/queries/chartQueries";
import { useWorkspace } from "@/stores/useWorkspace";

import { VlmLensConfigData } from "@/types/vlmLens";
import { VlmLensControls } from "./VlmLensControls";
import { VlmLensViewPanel } from "./VlmLensViewPanel";

interface VlmLensConfig {
    id: string;
    data: VlmLensConfigData;
    type: string;
}

export default function VlmLensArea() {
    const { chartId } = useParams<{ chartId: string }>();

    const { data: config } = useQuery({
        queryKey: queryKeys.charts.configByChart(chartId),
        queryFn: () => getConfigForChart(chartId),
        enabled: !!chartId,
    });

    const { data: chart, isLoading: isChartLoading } = useQuery({
        queryKey: queryKeys.charts.chart(chartId),
        queryFn: () => getChartById(chartId as string),
        enabled: !!chartId,
    });

    const { selectedModelIdx, setSelectedModelIdx } = useWorkspace();
    const [configModelUnavailable, setConfigModelUnavailable] = useState<string | null>(null);

    const { data: models } = useQuery({
        queryKey: ["models"],
        queryFn: getModels,
        refetchInterval: 120000,
    });

    useEffect(() => {
        if (config && models && models.length > 0) {
            const c = config as VlmLensConfig;
            const configModel = c.data?.model;
            if (configModel && configModel.length > 0) {
                const i = models.findIndex((m) => m.name === configModel);
                if (i !== -1) {
                    setSelectedModelIdx(i);
                    setConfigModelUnavailable(null);
                } else {
                    setConfigModelUnavailable(configModel);
                }
            } else {
                setConfigModelUnavailable(null);
            }
        }
    }, [config, models, setSelectedModelIdx]);

    const selectedModel = useMemo(() => {
        if (!models || models.length === 0) return undefined;
        return models[selectedModelIdx]?.name || models[0].name;
    }, [models, selectedModelIdx]);

    const header = (
        <div className="p-3 border-b flex items-center justify-between">
            <h2 className="text-sm pl-2 font-medium">VLM Logit Lens</h2>
            <div className="flex items-center gap-2">
                {configModelUnavailable && (
                    <Tooltip>
                        <TooltipTrigger>
                            <AlertCircle className="w-4 h-4 text-yellow-500" />
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs">
                            <p>
                                Model &quot;{configModelUnavailable}&quot; is not currently
                                available. Please select a different model.
                            </p>
                        </TooltipContent>
                    </Tooltip>
                )}
                <ModelSelector />
            </div>
        </div>
    );

    if (!config || !selectedModel || isChartLoading) {
        return (
            <div className="h-full flex flex-col md:min-w-64">
                {header}
                <div className="h-48 animate-pulse bg-muted/50 m-3 rounded" />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col md:min-w-64">
            {header}
            <div className="p-3 flex-1 overflow-auto flex flex-col gap-6 items-center">
                <div className="w-full">
                    <VlmLensControls
                        key={config.id}
                        initialConfig={config as VlmLensConfig}
                        selectedModel={selectedModel}
                        hasExistingData={!!(chart as { data?: unknown })?.data}
                    />
                </div>
                <VlmLensViewPanel />
            </div>
        </div>
    );
}
