"use client";

import { ModelSelector } from "@/components/ModelSelector";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getChartById, getConfigForChart } from "@/lib/queries/chartQueries";
import { queryKeys } from "@/lib/queryKeys";
import { useMemo, useEffect, useState } from "react";
import { getModels } from "@/lib/api/modelsApi";
import { useWorkspace } from "@/stores/useWorkspace";
import { AlertCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Lens2Controls } from "./Lens2Controls";
import { Lens2ConfigData } from "@/types/lens2";

interface Lens2Config {
    id: string;
    data: Lens2ConfigData;
    type: string;
}

export default function Lens2Area() {
    const { chartId } = useParams<{ chartId: string }>();

    const { data: config } = useQuery({
        queryKey: queryKeys.charts.configByChart(chartId),
        queryFn: () => getConfigForChart(chartId),
        enabled: !!chartId,
    });

    const { data: chart } = useQuery({
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

    // Sync the model selector with the model stored in the config when chart loads
    useEffect(() => {
        if (config && models && models.length > 0) {
            const lens2Config = config as Lens2Config;
            const configModel = lens2Config.data?.model;

            if (configModel && configModel.length > 0) {
                const modelIndex = models.findIndex((m) => m.name === configModel);
                if (modelIndex !== -1) {
                    setSelectedModelIdx(modelIndex);
                    setConfigModelUnavailable(null);
                } else {
                    setConfigModelUnavailable(configModel);
                }
            } else {
                setConfigModelUnavailable(null);
            }
        }
    }, [config?.id, models, setSelectedModelIdx]);

    const selectedModel = useMemo(() => {
        if (!models || models.length === 0) return undefined;
        return models[selectedModelIdx]?.name || models[0].name;
    }, [models, selectedModelIdx]);

    if (!config || !selectedModel) {
        return (
            <div className="h-full flex flex-col min-w-64">
                <div className="p-3 border-b flex items-center justify-between">
                    <h2 className="text-sm pl-2 font-medium">Model</h2>
                    <div className="flex items-center gap-2">
                        {configModelUnavailable && (
                            <Tooltip>
                                <TooltipTrigger>
                                    <AlertCircle className="w-4 h-4 text-yellow-500" />
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-xs">
                                    <p>
                                        Model &quot;{configModelUnavailable}&quot; is not currently available.
                                        Please select a different model.
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                        )}
                        <ModelSelector />
                    </div>
                </div>
                <div className="h-48 animate-pulse bg-muted/50 m-3 rounded" />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col min-w-64">
            <div className="p-3 border-b flex items-center justify-between">
                <h2 className="text-sm pl-2 font-medium">Model</h2>
                <div className="flex items-center gap-2">
                    {configModelUnavailable && (
                        <Tooltip>
                            <TooltipTrigger>
                                <AlertCircle className="w-4 h-4 text-yellow-500" />
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">
                                <p>
                                    Model &quot;{configModelUnavailable}&quot; is not currently available.
                                    Please select a different model.
                                </p>
                            </TooltipContent>
                        </Tooltip>
                    )}
                    <ModelSelector />
                </div>
            </div>

            <div className="p-3 flex-1 overflow-auto">
                <Lens2Controls
                    initialConfig={config as Lens2Config}
                    selectedModel={selectedModel}
                />
            </div>
        </div>
    );
}
