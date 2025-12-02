import { ModelSelector } from "@/components/ModelSelector";
import { CompletionCard } from "./CompletionCard";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getChartById, getConfigForChart } from "@/lib/queries/chartQueries";
import { LensConfig } from "@/db/schema";
import { queryKeys } from "@/lib/queryKeys";
import { ChartType } from "@/types/charts";
import { useMemo, useEffect, useState } from "react";
import { getModels, getModelsForTool } from "@/lib/api/modelsApi";
import { useWorkspace } from "@/stores/useWorkspace";
import { Loader2, AlertCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "lucide-react";

export default function LensArea() {
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

    const { data: modelsResponse } = useQuery({
        queryKey: ["models"],
        queryFn: getModels,
        refetchInterval: 120000,
    });

    // Get models for logit-lens tool
    const models = useMemo(() => {
        if (!modelsResponse) return [];
        return getModelsForTool(modelsResponse, "logit-lens");
    }, [modelsResponse]);

    // Sync the model selector with the model stored in the config when chart loads
    useEffect(() => {
        if (config && models && models.length > 0) {
            const lensConfig = config as LensConfig;
            const configModel = lensConfig.data.model;

            // If there's a model in the config, try to select it
            if (configModel && configModel.length > 0) {
                const modelIndex = models.findIndex((m) => m.name === configModel);
                if (modelIndex !== -1) {
                    console.log("Setting model selector to config model:", configModel);
                    setSelectedModelIdx(modelIndex);
                    setConfigModelUnavailable(null);
                } else {
                    console.warn("Config model not available:", configModel);
                    setConfigModelUnavailable(configModel);
                    // Model from config is not available, keep current selection
                }
            } else {
                setConfigModelUnavailable(null);
            }
        }
    }, [config?.id, models]); // Only run when config id or models change

    const selectedModel = useMemo(() => {
        if (!models || models.length === 0) return undefined;
        return models[selectedModelIdx]?.name || models[0].name;
    }, [models, selectedModelIdx]);

    console.log("hiiiii my initial config is", config);

    if (!config || !selectedModel) {
        return (
            <div className="h-full flex flex-col min-w-80">
                <div className="p-3 border-b flex items-center justify-between">
                    <div className="flex items-center">
                        <h2 className="text-sm pl-2 font-medium">Logit Lens</h2>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="bg-transparent hover:!white/10"
                            asChild
                        >
                            <Link
                                href="https://www.lesswrong.com/posts/AcKRB8wDpdaN6v6ru/interpreting-gpt-the-logit-lens"
                                target="_blank"
                            >
                                <HelpCircle className="h-4 w-4" />
                            </Link>
                        </Button>
                    </div>
                    <div className="flex items-center gap-2">
                        {configModelUnavailable && (
                            <Tooltip>
                                <TooltipTrigger>
                                    <AlertCircle className="w-4 h-4 text-yellow-500" />
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-xs">
                                    <p>
                                        Model "{configModelUnavailable}" is not currently available.
                                        Please select a different model and retokenize.
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                        )}
                        <ModelSelector toolType="logit-lens" />
                    </div>
                </div>

                <div className="h-48 animate-pulse bg-muted/50 m-3 rounded" />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col min-w-80">
            <div className="p-3 border-b flex items-center justify-between">
                <div className="flex items-center">
                    <h2 className="text-sm pl-2 font-medium">Logit Lens</h2>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="bg-transparent hover:!white/10"
                        asChild
                    >
                        <Link
                            href="https://www.lesswrong.com/posts/AcKRB8wDpdaN6v6ru/interpreting-gpt-the-logit-lens"
                            target="_blank"
                        >
                            <HelpCircle className="h-4 w-4" />
                        </Link>
                    </Button>
                </div>
                <div className="flex items-center gap-2">
                    {configModelUnavailable && (
                        <Tooltip>
                            <TooltipTrigger>
                                <AlertCircle className="w-4 h-4 text-yellow-500" />
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">
                                <p>
                                    Model "{configModelUnavailable}" is not currently available.
                                    Please select a different model and retokenize.
                                </p>
                            </TooltipContent>
                        </Tooltip>
                    )}
                    <ModelSelector toolType="logit-lens" />
                </div>
            </div>

            <div className="p-3">
                {/* Assume lens config here; unified page will gate by config.type */}
                <CompletionCard
                    initialConfig={config as LensConfig}
                    chartType={chart?.type as ChartType}
                    selectedModel={selectedModel}
                />
            </div>
        </div>
    );
}
