"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery, useIsMutating } from "@tanstack/react-query";
import { getChartById, getConfigForChart } from "@/lib/queries/chartQueries";
import { getWorkspaceById } from "@/lib/queries/workspaceQueries";
import { queryKeys } from "@/lib/queryKeys";
import { ActivationPatchingData, ActivationPatchingConfigData } from "@/types/activationPatching";
import { Loader2 } from "lucide-react";
import { ActivationPatchingWidget } from "nnsightful";
import { useTheme } from "next-themes";
import { useUpdateChartName } from "@/lib/api/chartApi";
import { NotebookExporter } from "@/components/NotebookExporter";

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
    const { chartId, workspaceId } = useParams<{ chartId: string; workspaceId: string }>();
    const { resolvedTheme } = useTheme();
    const isDarkMode = resolvedTheme === "dark";
    const [localTitle, setLocalTitle] = useState<string | null>(null); // null means use chart name
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const titleInputRef = useRef<HTMLInputElement>(null);
    const saveTitleTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

    const { data: workspace } = useQuery({
        queryKey: queryKeys.workspaces.workspace(workspaceId),
        queryFn: () => getWorkspaceById(workspaceId),
        enabled: !!workspaceId,
    });

    const { mutate: updateChartName } = useUpdateChartName();

    const patchingChart = chart as ActivationPatchingChart | undefined;
    const patchingConfig = config as ActivationPatchingConfig | undefined;
    const hasData = patchingChart?.data && "lines" in patchingChart.data && patchingChart.data.lines.length > 0;

    // Get the chart's saved name (treat "Untitled Chart" default as empty)
    const rawChartName = patchingChart?.name || "";
    const chartName = rawChartName === "Untitled Chart" ? "" : rawChartName;
    
    // The display title: use localTitle while editing, otherwise use chart name
    const displayTitle = localTitle !== null ? localTitle : chartName;
    const hasTitle = displayTitle.trim().length > 0 && displayTitle.trim() !== "Untitled Chart";

    // Reset local title when chart changes
    useEffect(() => {
        setLocalTitle(null);
        setIsEditingTitle(false);
    }, [chartId]);

    // Save title to chart (debounced) - don't reset localTitle here to avoid flickering
    const saveTitle = useCallback((newTitle: string) => {
        if (!chartId) return;
        
        if (saveTitleTimeoutRef.current) {
            clearTimeout(saveTitleTimeoutRef.current);
        }

        saveTitleTimeoutRef.current = setTimeout(() => {
            updateChartName({ chartId, name: newTitle });
        }, 500);
    }, [chartId, updateChartName]);

    // Handle title change
    const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const newTitle = e.target.value;
        setLocalTitle(newTitle);
        saveTitle(newTitle);
    }, [saveTitle]);

    // Handle title blur - keep local title to avoid flicker, it will sync on chart change
    const handleTitleBlur = useCallback(() => {
        setIsEditingTitle(false);
    }, []);

    // Handle title click to edit
    const handleTitleClick = useCallback(() => {
        setLocalTitle(displayTitle); // Start editing with current displayed title
        setIsEditingTitle(true);
        setTimeout(() => {
            titleInputRef.current?.focus();
            titleInputRef.current?.select();
        }, 0);
    }, [displayTitle]);

    // Get selected line indices from config (managed by ActivationPatchingControls)
    const selectedLineIndices = useMemo(() => {
        if (patchingConfig?.data?.selectedLineIndices) {
            return new Set(patchingConfig.data.selectedLineIndices);
        }
        // Default to first two lines
        return new Set([0, 1]);
    }, [patchingConfig?.data?.selectedLineIndices]);

    // Prepare filtered activation patching data (all metrics, filtered by selected tokens)
    const filteredData = useMemo(() => {
        if (!hasData || !patchingChart?.data) return null;

        const indices = Array.from(selectedLineIndices).sort((a, b) => a - b);
        const d = patchingChart.data!;

        const filterByIndices = (arr: number[][]) =>
            indices.filter(i => i < arr.length).map(i => arr[i]);

        return {
            lines: filterByIndices(d.lines),
            ranks: d.ranks ? filterByIndices(d.ranks) : [],
            prob_diffs: d.prob_diffs ? filterByIndices(d.prob_diffs) : [],
            tokenLabels: d.tokenLabels
                ? indices.filter(i => i < d.tokenLabels!.length).map(i => d.tokenLabels![i])
                : [],
        };
    }, [hasData, patchingChart?.data, selectedLineIndices]);

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
            <div className="flex size-full items-center justify-center border mx-3 mt-3 border-dashed rounded pb-6">
                <div className="text-muted-foreground text-center max-w-md">
                    <p className="text-lg font-medium mb-2">No visualization data</p>
                    <p className="text-sm">
                        Enter source and target prompts, select token positions in each,
                        then click &quot;Run Activation Patching&quot; to visualize how activations
                        transfer between prompts across model layers.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="size-full overflow-auto flex flex-col">
            {/* Title + export */}
            <div className="px-4 pt-4 pb-2 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                    {isEditingTitle ? (
                        <input
                            ref={titleInputRef}
                            type="text"
                            value={displayTitle}
                            onChange={handleTitleChange}
                            onBlur={handleTitleBlur}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.currentTarget.blur();
                                }
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
                <NotebookExporter
                    configType="activation-patching"
                    configData={(patchingConfig?.data ?? {}) as Record<string, unknown>}
                    chartData={(patchingChart?.data ?? null) as Record<string, unknown> | null}
                    chartName={patchingChart?.name ?? undefined}
                    workspaceName={workspace?.name ?? undefined}
                />
            </div>

            {/* Chart area */}
            <div className="flex-1 p-4 min-h-0">
                {filteredData && filteredData.lines.length > 0 ? (
                    <ActivationPatchingWidget
                        data={filteredData}
                        darkMode={isDarkMode}
                        transparentBackground
                    />
                ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                        Select at least one token to display
                    </div>
                )}
            </div>
        </div>
    );
}
