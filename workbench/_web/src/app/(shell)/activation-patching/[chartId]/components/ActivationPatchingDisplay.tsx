"use client";

import { useCallback, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import { useScopedWorkspaceId } from "@/components/providers/WorkspaceScopeProvider";
import { useQuery, useIsMutating } from "@tanstack/react-query";
import { getChartById, getConfigForChart } from "@/lib/queries/chartQueries";
import { queryKeys } from "@/lib/queryKeys";
import { useCapture } from "@/lib/analytics";
import { ActivationPatchingData, ActivationPatchingConfigData } from "@/types/activationPatching";
import type { ActivationPatchingMode } from "nnsightful";
import { Loader2 } from "lucide-react";
import { ActivationPatchingWidget } from "nnsightful";
import { useTheme } from "next-themes";
import { useUpdateChartConfig } from "@/lib/api/configApi";
import { ChartModelPill } from "@/components/charts/ChartModelPill";
import { chartModelFromConfig, isChartStale } from "@/lib/configModelDiff";
import { useModelsQuery } from "@/lib/api/modelsApi";
import { useWorkspace } from "@/stores/useWorkspace";
import { selectedModelIn } from "@/components/model-selector/status";

const validModes = new Set<string>(["probability", "rank", "prob_diff"]);

interface ActivationPatchingChart {
    id: string;
    data: ActivationPatchingData | null;
    type: string;
    workspaceId?: string;
    name?: string;
}

interface ActivationPatchingConfig {
    id: string;
    data: ActivationPatchingConfigData;
    type: string;
    workspaceId: string;
}

export function ActivationPatchingDisplay() {
    const { chartId } = useParams<{ chartId: string }>();
    const workspaceId = useScopedWorkspaceId();
    const capture = useCapture();
    const { resolvedTheme } = useTheme();
    const isDarkMode = resolvedTheme === "dark";

    const isPatchingRunning = useIsMutating({ mutationKey: ["activationPatching"] }) > 0;

    const { data: chart, isLoading: isChartLoading } = useQuery({
        queryKey: queryKeys.charts.chart(chartId),
        queryFn: () => getChartById(chartId as string),
        enabled: !!chartId,
    });

    const { data: config, isLoading: isConfigLoading } = useQuery({
        queryKey: queryKeys.charts.configByChart(chartId),
        queryFn: () => getConfigForChart(chartId),
        enabled: !!chartId,
    });

    const { data: models } = useModelsQuery();

    const { selectedModel: selectedName } = useWorkspace();
    const selectedModel = selectedModelIn(models, selectedName)?.name ?? null;
    const modelsAvailable = !!models && models.length > 0;

    const { mutateAsync: updateConfig } = useUpdateChartConfig();

    const patchingChart = chart as ActivationPatchingChart | undefined;
    const patchingConfig = config as ActivationPatchingConfig | undefined;
    const hasData =
        patchingChart?.data && "lines" in patchingChart.data && patchingChart.data.lines.length > 0;

    // Debounced save of token selection to config
    const saveTokenTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const patchingConfigRef = useRef(patchingConfig);
    patchingConfigRef.current = patchingConfig;

    const handleTokenSelectionChange = useCallback(
        (indices: number[]) => {
            capture("param_changed", {
                tool: "activation-patching",
                param: "token_selection",
                value: indices.length,
            });
            if (saveTokenTimeoutRef.current) clearTimeout(saveTokenTimeoutRef.current);
            saveTokenTimeoutRef.current = setTimeout(() => {
                const cfg = patchingConfigRef.current;
                if (!cfg?.id) return;
                updateConfig({
                    configId: cfg.id,
                    chartId,
                    config: {
                        data: { ...cfg.data, selectedLineIndices: indices },
                        workspaceId,
                        type: "activation-patching",
                    },
                });
            }, 500);
        },
        [chartId, workspaceId, updateConfig, capture],
    );

    // Debounced save of mode to config
    const saveModeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const handleModeChange = useCallback(
        (mode: ActivationPatchingMode) => {
            capture("param_changed", {
                tool: "activation-patching",
                param: "mode",
                value: mode,
            });
            if (saveModeTimeoutRef.current) clearTimeout(saveModeTimeoutRef.current);
            saveModeTimeoutRef.current = setTimeout(() => {
                const cfg = patchingConfigRef.current;
                if (!cfg?.id) return;
                updateConfig({
                    configId: cfg.id,
                    chartId,
                    config: {
                        data: { ...cfg.data, selectedMode: mode },
                        workspaceId,
                        type: "activation-patching",
                    },
                });
            }, 300);
        },
        [chartId, workspaceId, updateConfig, capture],
    );

    // Clear pending saves on unmount
    useEffect(() => {
        return () => {
            if (saveTokenTimeoutRef.current) clearTimeout(saveTokenTimeoutRef.current);
            if (saveModeTimeoutRef.current) clearTimeout(saveModeTimeoutRef.current);
        };
    }, []);

    // Loading state
    if (isChartLoading || isConfigLoading) {
        return (
            <div className="flex size-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // Computing state
    if (isPatchingRunning) {
        return (
            <div className="flex size-full items-center justify-center flex-col gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Computing activation patching...</p>
            </div>
        );
    }

    // Empty state
    if (!hasData) {
        return (
            <div className="size-full px-3 pt-3">
                <div className="flex size-full items-center justify-center rounded border border-dashed px-4 pb-6">
                    <div className="text-muted-foreground text-center max-w-md">
                        <p className="text-lg font-medium mb-2">No visualization data</p>
                        <p className="text-sm">
                            Enter source and target prompts, select token positions in each, then
                            click &quot;Run Activation Patching&quot; to visualize how activations
                            transfer between prompts across model layers.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    const chartModel = chartModelFromConfig(patchingConfig);
    const stale = isChartStale(chartModel, selectedModel, modelsAvailable);

    return (
        <div className="size-full overflow-auto flex flex-col">
            {stale && chartModel && (
                <div className="flex items-center justify-end gap-2 px-4 pt-4 pb-2">
                    <ChartModelPill modelName={chartModel} />
                </div>
            )}

            {/* Chart area */}
            <div className="flex-1 p-4 min-h-0">
                <ActivationPatchingWidget
                    data={patchingChart!.data!}
                    darkMode={isDarkMode}
                    transparentBackground
                    mode={
                        validModes.has(patchingConfig?.data?.selectedMode ?? "")
                            ? (patchingConfig!.data!.selectedMode as ActivationPatchingMode)
                            : "probability"
                    }
                    selectedTokens={patchingConfig?.data?.selectedLineIndices}
                    onTokenSelectionChange={handleTokenSelectionChange}
                    onModeChange={handleModeChange}
                />
            </div>
        </div>
    );
}
