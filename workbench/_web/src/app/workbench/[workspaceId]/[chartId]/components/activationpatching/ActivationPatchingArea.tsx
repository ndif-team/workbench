import { ModelSelector } from "@/components/ModelSelector";
import { ActivationPatchingCompletionCard } from "./ActivationPatchingCompletionCard";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getChartById, getConfigForChart } from "@/lib/queries/chartQueries";
import { queryKeys } from "@/lib/queryKeys";
import { useMemo, useEffect, useState } from "react";
import { getModels, getAllModels } from "@/lib/api/modelsApi";
import { useWorkspace } from "@/stores/useWorkspace";
import { AlertCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "lucide-react";

export default function ActivationPatchingArea() {
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

    // Get all models (activation patching supports all models)
    const models = useMemo(() => {
        if (!modelsResponse) return [];
        return getAllModels(modelsResponse);
    }, [modelsResponse]);

    // Sync the model selector with the model stored in the config when chart loads
    useEffect(() => {
        if (config && models && models.length > 0) {
            const patchingConfig = config.data as any;
            const configModel = patchingConfig.model;

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
    }, [config?.id, models]);

    const selectedModel = useMemo(() => {
        if (!models || models.length === 0) return undefined;
        return models[selectedModelIdx]?.name || models[0].name;
    }, [models, selectedModelIdx]);

    if (!config || !selectedModel) {
        return (
            <div className="h-full flex flex-col min-w-80">
                <div className="p-3 border-b flex items-center justify-between">
                    <div className="flex items-center">
                        <h2 className="text-sm pl-2 font-medium">Activation Patching</h2>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="bg-transparent hover:!white/10"
                            asChild
                        >
                            <Link
                                href="https://www.lesswrong.com/posts/3ecs6duLmTfyra3Gp/causal-scrubbing-appendix"
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
                        <ModelSelector />
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
                    <h2 className="text-sm pl-2 font-medium">Activation Patching</h2>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="bg-transparent hover:!white/10"
                        asChild
                    >
                        <Link
                            href="https://www.lesswrong.com/posts/3ecs6duLmTfyra3Gp/causal-scrubbing-appendix"
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
                    <ModelSelector />
                </div>
            </div>

            <div className="p-3">
                <ActivationPatchingCompletionCard
                    initialConfig={config}
                    selectedModel={selectedModel}
                />
            </div>
        </div>
    );
}


