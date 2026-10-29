"use client";

import { useCallback, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import { useScopedWorkspaceId } from "@/components/providers/WorkspaceScopeProvider";
import { useQuery, useIsMutating } from "@tanstack/react-query";
import { getChartById, getConfigForChart } from "@/lib/queries/chartQueries";
import { queryKeys } from "@/lib/queryKeys";
import { LogitLensConfigData } from "@/types/logitLens";
import { useTheme } from "next-themes";
import { Loader2 } from "lucide-react";
import { LogitLensWidget } from "nnsightful";
import type { LogitLensData, LogitLensUIState } from "nnsightful";
import { useModelsQuery } from "@/lib/api/modelsApi";
import { useWorkspace } from "@/stores/useWorkspace";
import { useUpdateChartConfig } from "@/lib/api/configApi";
import { ChartModelPill } from "@/components/charts/ChartModelPill";
import { chartModelFromConfig, isChartStale } from "@/lib/configModelDiff";

interface LogitLensChart {
    id: string;
    data: LogitLensData | null;
    type: string;
    name?: string;
}

interface LogitLensConfig {
    id: string;
    data: LogitLensConfigData;
    type: string;
}

export function LogitLensDisplay() {
    const { chartId } = useParams<{ chartId: string }>();
    const workspaceId = useScopedWorkspaceId();
    const { resolvedTheme } = useTheme();
    const isDarkMode = resolvedTheme === "dark";

    const isLogitLensRunning = useIsMutating({ mutationKey: ["logit-lens"] }) > 0;

    const { data: chart, isLoading } = useQuery({
        queryKey: queryKeys.charts.chart(chartId),
        queryFn: () => getChartById(chartId as string),
        enabled: !!chartId,
    });

    const { data: config } = useQuery({
        queryKey: queryKeys.charts.configByChart(chartId),
        queryFn: () => getConfigForChart(chartId),
        enabled: !!chartId,
    });

    const { data: models } = useModelsQuery();

    const { selectedModelIdx } = useWorkspace();
    const selectedModel = models?.[selectedModelIdx]?.name ?? models?.[0]?.name ?? null;
    const modelsAvailable = !!models && models.length > 0;

    const { mutate: updateChartConfig } = useUpdateChartConfig();

    const logitLensChart = chart as LogitLensChart | undefined;
    const logitLensConfig = config as LogitLensConfig | undefined;
    const hasData = logitLensChart?.data && "meta" in logitLensChart.data;

    // ── Persist heatmap UI state (pins, selection, layer window, appearance)
    // into the chart config, mirroring ActivationPatchingDisplay. Debounced
    // because the widget emits on every interaction; restored on mount via
    // the `uiState` prop below.
    const savedUiState = logitLensConfig?.data?.uiState as LogitLensUIState | undefined;
    const logitLensConfigRef = useRef(logitLensConfig);
    logitLensConfigRef.current = logitLensConfig;
    const saveUiStateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleStateChange = useCallback(
        (uiState: LogitLensUIState) => {
            if (saveUiStateTimeoutRef.current) clearTimeout(saveUiStateTimeoutRef.current);
            saveUiStateTimeoutRef.current = setTimeout(() => {
                const cfg = logitLensConfigRef.current;
                if (!cfg?.id) return;
                updateChartConfig({
                    configId: cfg.id,
                    chartId,
                    config: {
                        data: { ...cfg.data, uiState },
                        workspaceId,
                        type: "logit-lens",
                    },
                });
            }, 500);
        },
        [chartId, workspaceId, updateChartConfig],
    );

    useEffect(() => {
        return () => {
            if (saveUiStateTimeoutRef.current) clearTimeout(saveUiStateTimeoutRef.current);
        };
    }, []);

    const chartModel = chartModelFromConfig(logitLensConfig, logitLensChart);
    const stale = isChartStale(chartModel, selectedModel, modelsAvailable);

    if (isLoading) {
        return (
            <div className="flex size-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (isLogitLensRunning) {
        return (
            <div className="flex size-full items-center justify-center flex-col gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Computing logit lens visualization...</p>
            </div>
        );
    }

    if (!hasData) {
        return (
            <div className="size-full px-3 pt-3">
                <div className="flex size-full items-center justify-center rounded border border-dashed px-4 pb-6">
                    <div className="text-muted-foreground text-center">
                        <p>No visualization data</p>
                        <p className="text-sm mt-2">
                            Enter a prompt and click &quot;Run Logit Lens&quot; to visualize
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="size-full overflow-auto p-4 flex flex-col gap-3">
            {stale && chartModel && (
                <div className="flex justify-end">
                    <ChartModelPill modelName={chartModel} />
                </div>
            )}
            <LogitLensWidget
                data={logitLensChart.data! as LogitLensData}
                darkMode={isDarkMode}
                uiState={savedUiState}
                onStateChange={handleStateChange}
                className="w-full min-h-[400px]"
            />
        </div>
    );
}
