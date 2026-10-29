"use client";

import { useCallback, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import { useScopedWorkspaceId } from "@/components/providers/WorkspaceScopeProvider";
import { useQuery, useIsMutating } from "@tanstack/react-query";
import { getChartById, getConfigForChart } from "@/lib/queries/chartQueries";
import { queryKeys } from "@/lib/queryKeys";
import { JLensData, JLensConfigData } from "@/types/jlens";
import { useTheme } from "next-themes";
import { Loader2 } from "lucide-react";
import { LogitLensWidget } from "nnsightful";
import type { LogitLensData, LogitLensUIState } from "nnsightful";
import { useModelsQuery } from "@/lib/api/modelsApi";
import { useWorkspace } from "@/stores/useWorkspace";
import { useUpdateChartConfig } from "@/lib/api/configApi";
import { ChartModelPill } from "@/components/charts/ChartModelPill";
import { chartModelFromConfig, isChartStale } from "@/lib/configModelDiff";
import { isToolSupportedForModel } from "@/lib/toolSupport";

interface JLensChart {
    id: string;
    data: JLensData | null;
    type: string;
    name?: string;
}

interface JLensConfig {
    id: string;
    data: JLensConfigData;
    type: string;
}

export function JLensDisplay() {
    const { chartId } = useParams<{ chartId: string }>();
    const workspaceId = useScopedWorkspaceId();
    const { resolvedTheme } = useTheme();
    const isDarkMode = resolvedTheme === "dark";

    const isJLensRunning = useIsMutating({ mutationKey: ["jlens"] }) > 0;

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
    const selectedModelObj = models?.[selectedModelIdx] ?? models?.[0];
    const selectedModel = selectedModelObj?.name ?? null;
    const modelsAvailable = !!models && models.length > 0;
    // Whether the currently-selected model can run j-lens. Only meaningful for
    // the empty-state prompt; a saved result always renders regardless.
    const modelSupported = !selectedModelObj || isToolSupportedForModel("jlens", selectedModelObj);

    const { mutate: updateChartConfig } = useUpdateChartConfig();

    const jlensChart = chart as JLensChart | undefined;
    const jlensConfig = config as JLensConfig | undefined;
    const hasData = jlensChart?.data && "meta" in jlensChart.data;

    // ── Persist heatmap UI state (pins, selection, layer window, appearance)
    // into the chart config, mirroring LogitLensDisplay. Debounced because the
    // widget emits on every interaction; restored on mount via the `uiState`
    // prop below.
    const savedUiState = jlensConfig?.data?.uiState as LogitLensUIState | undefined;
    const jlensConfigRef = useRef(jlensConfig);
    jlensConfigRef.current = jlensConfig;
    const saveUiStateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleStateChange = useCallback(
        (uiState: LogitLensUIState) => {
            if (saveUiStateTimeoutRef.current) clearTimeout(saveUiStateTimeoutRef.current);
            saveUiStateTimeoutRef.current = setTimeout(() => {
                const cfg = jlensConfigRef.current;
                if (!cfg?.id) return;
                updateChartConfig({
                    configId: cfg.id,
                    chartId,
                    config: {
                        data: { ...cfg.data, uiState },
                        workspaceId,
                        type: "jlens",
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

    const chartModel = chartModelFromConfig(jlensConfig, jlensChart);
    const stale = isChartStale(chartModel, selectedModel, modelsAvailable);

    if (isLoading) {
        return (
            <div className="flex size-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (isJLensRunning) {
        return (
            <div className="flex size-full items-center justify-center flex-col gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Computing j-lens visualization...</p>
            </div>
        );
    }

    if (!hasData) {
        return (
            <div className="size-full px-3 pt-3">
                <div className="flex size-full items-center justify-center rounded border border-dashed px-4 pb-6">
                    <div className="text-muted-foreground text-center">
                        {modelSupported ? (
                            <>
                                <p>No visualization data</p>
                                <p className="text-sm mt-2">
                                    Enter a prompt and click &quot;Run J-Lens&quot; to visualize
                                </p>
                            </>
                        ) : (
                            <>
                                <p>J-Lens isn&apos;t available for this model</p>
                                <p className="text-sm mt-2">
                                    Select a model with a Jacobian lens from the header to run
                                    J-Lens.
                                </p>
                            </>
                        )}
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
                data={jlensChart.data! as LogitLensData}
                darkMode={isDarkMode}
                uiState={savedUiState}
                onStateChange={handleStateChange}
                className="w-full min-h-[400px]"
            />
        </div>
    );
}
