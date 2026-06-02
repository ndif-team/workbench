"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery, useIsMutating } from "@tanstack/react-query";
import { getChartById, getConfigForChart } from "@/lib/queries/chartQueries";
import { queryKeys } from "@/lib/queryKeys";
import { Lens2Data, Lens2ConfigData } from "@/types/lens2";
import { useTheme } from "next-themes";
import { Loader2 } from "lucide-react";
import { LogitLensWidget } from "nnsightful";
import type { LogitLensData, LogitLensUIState } from "nnsightful";
import { useModelsQuery } from "@/lib/api/modelsApi";
import { useWorkspace } from "@/stores/useWorkspace";
import { useUpdateChartName } from "@/lib/api/chartApi";
import { useUpdateChartConfig } from "@/lib/api/configApi";
import { ChartModelPill } from "@/components/charts/ChartModelPill";
import { chartModelFromConfig, isChartStale } from "@/lib/configModelDiff";

interface Lens2Chart {
    id: string;
    data: Lens2Data | null;
    type: string;
    name?: string;
}

interface Lens2Config {
    id: string;
    data: Lens2ConfigData;
    type: string;
}

export function Lens2Display() {
    const { chartId, workspaceId } = useParams<{ chartId: string; workspaceId: string }>();
    const { resolvedTheme } = useTheme();
    const isDarkMode = resolvedTheme === "dark";

    const isLens2Running = useIsMutating({ mutationKey: ["lens2"] }) > 0;

    const [localTitle, setLocalTitle] = useState<string | null>(null); // null → use chart name
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const titleInputRef = useRef<HTMLInputElement>(null);
    const saveTitleTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

    const { mutate: updateChartName } = useUpdateChartName();
    const { mutate: updateChartConfig } = useUpdateChartConfig();

    const lens2Chart = chart as Lens2Chart | undefined;
    const lens2Config = config as Lens2Config | undefined;
    const hasData = lens2Chart?.data && "meta" in lens2Chart.data;

    // ── Persist heatmap UI state (pins, selection, layer window, appearance)
    // into the chart config, mirroring ActivationPatchingDisplay. Debounced
    // because the widget emits on every interaction; restored on mount via
    // the `uiState` prop below.
    const savedUiState = lens2Config?.data?.uiState as LogitLensUIState | undefined;
    const lens2ConfigRef = useRef(lens2Config);
    lens2ConfigRef.current = lens2Config;
    const saveUiStateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleStateChange = useCallback(
        (uiState: LogitLensUIState) => {
            if (saveUiStateTimeoutRef.current) clearTimeout(saveUiStateTimeoutRef.current);
            saveUiStateTimeoutRef.current = setTimeout(() => {
                const cfg = lens2ConfigRef.current;
                if (!cfg?.id) return;
                updateChartConfig({
                    configId: cfg.id,
                    chartId,
                    config: {
                        data: { ...cfg.data, uiState },
                        workspaceId,
                        type: "lens2",
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

    const chartModel = chartModelFromConfig(lens2Config, lens2Chart);
    const stale = isChartStale(chartModel, selectedModel, modelsAvailable);

    // Chart title — mirrors ActivationPatchingDisplay. "Untitled Chart" is the
    // stored default and treated as empty for display purposes.
    const rawChartName = lens2Chart?.name || "";
    const chartName = rawChartName === "Untitled Chart" ? "" : rawChartName;
    const displayTitle = localTitle !== null ? localTitle : chartName;
    const hasTitle =
        displayTitle.trim().length > 0 && displayTitle.trim() !== "Untitled Chart";

    // Reset local title when the chart changes.
    useEffect(() => {
        setLocalTitle(null);
        setIsEditingTitle(false);
    }, [chartId]);

    // Debounced save; don't reset localTitle here to avoid flicker (it syncs
    // on chart change).
    const saveTitle = useCallback(
        (newTitle: string) => {
            if (!chartId) return;
            if (saveTitleTimeoutRef.current) clearTimeout(saveTitleTimeoutRef.current);
            saveTitleTimeoutRef.current = setTimeout(() => {
                updateChartName({ chartId, name: newTitle });
            }, 500);
        },
        [chartId, updateChartName],
    );

    const handleTitleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const newTitle = e.target.value;
            setLocalTitle(newTitle);
            saveTitle(newTitle);
        },
        [saveTitle],
    );

    const handleTitleBlur = useCallback(() => setIsEditingTitle(false), []);

    const handleTitleClick = useCallback(() => {
        setLocalTitle(displayTitle);
        setIsEditingTitle(true);
        setTimeout(() => {
            titleInputRef.current?.focus();
            titleInputRef.current?.select();
        }, 0);
    }, [displayTitle]);

    if (isLoading) {
        return (
            <div className="flex size-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (isLens2Running) {
        return (
            <div className="flex size-full items-center justify-center flex-col gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Computing logit lens visualization...</p>
            </div>
        );
    }

    if (!hasData) {
        return (
            <div className="flex size-full items-center justify-center border mx-3 mt-3 border-dashed rounded pb-6">
                <div className="text-muted-foreground text-center">
                    <p>No visualization data</p>
                    <p className="text-sm mt-2">
                        Enter a prompt and click &quot;Run Logit Lens&quot; to visualize
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="size-full overflow-auto p-4 flex flex-col gap-3">
            {/* Title + model pill */}
            <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                    {isEditingTitle ? (
                        <input
                            ref={titleInputRef}
                            type="text"
                            value={displayTitle}
                            onChange={handleTitleChange}
                            onBlur={handleTitleBlur}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") e.currentTarget.blur();
                            }}
                            placeholder="Untitled Chart"
                            className="w-full text-lg font-semibold bg-transparent border-none outline-none focus:ring-0 placeholder:text-muted-foreground/50"
                        />
                    ) : hasTitle ? (
                        <h2
                            onClick={handleTitleClick}
                            className="cursor-text hover:bg-accent/30 rounded px-1 -mx-1 py-0.5 transition-colors text-lg font-semibold truncate"
                        >
                            {displayTitle}
                        </h2>
                    ) : (
                        <h2
                            onClick={handleTitleClick}
                            className="cursor-text hover:bg-accent/30 rounded px-1 -mx-1 py-0.5 transition-colors text-lg font-medium text-gray-400"
                        >
                            Untitled Chart
                        </h2>
                    )}
                </div>
                {stale && chartModel && <ChartModelPill modelName={chartModel} />}
            </div>
            <LogitLensWidget
                data={lens2Chart.data! as LogitLensData}
                darkMode={isDarkMode}
                uiState={savedUiState}
                onStateChange={handleStateChange}
                className="w-full min-h-[400px]"
            />
        </div>
    );
}
