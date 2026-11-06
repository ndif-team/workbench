import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
    deleteChart,
    createLogitLensChartPair,
    createJLensChartPair,
    createPatchLensChartPair,
    createActivationPatchingChartPair,
    updateChartName,
    copyChart,
    createChartFromLaunch,
} from "@/lib/queries/chartQueries";
import type { ChartLaunchRequest } from "@/lib/chartLaunch";
import { LogitLensConfigData } from "@/types/logitLens";
import { JLensConfigData } from "@/types/jlens";
import { ActivationPatchingConfigData } from "@/types/activationPatching";
import { queryKeys } from "../queryKeys";
import { useCapture } from "../analytics";
import type { WorkspaceLibrary } from "@/types/workspaces";
import { ItemAnalytics } from "./workspaceApi";

/** The library with one chart renamed, so the sidebar shows a rename before the refetch lands. */
const renameInLibrary = (library: WorkspaceLibrary, chartId: string, name: string) => {
    const rename = <T extends WorkspaceLibrary["defaultItems"][number]>(item: T): T =>
        item.kind === "chart" && item.id === chartId ? { ...item, name } : item;
    return {
        ...library,
        defaultItems: library.defaultItems.map(rename),
        workspaces: library.workspaces.map((w) => ({ ...w, items: w.items.map(rename) })),
    };
};

/**
 * Renames a chart. Clearing a name saves the default one, reported as a
 * `name_length` of 0.
 */
export const useUpdateChartName = () => {
    const queryClient = useQueryClient();
    const capture = useCapture();

    return useMutation({
        mutationKey: ["updateChartName"],
        mutationFn: async ({ chartId, name }: { chartId: string; name: string }) => {
            return await updateChartName(chartId, name);
        },
        onMutate: ({ chartId, name }) => {
            queryClient.setQueryData<WorkspaceLibrary>(queryKeys.workspaces.library, (library) =>
                library ? renameInLibrary(library, chartId, name) : library,
            );
        },
        onSuccess: (data, variables) => {
            const chartKey = queryKeys.charts.chart(variables.chartId);
            queryClient.invalidateQueries({ queryKey: chartKey });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });

            // Also invalidate sidebar to update the chart name in the card
            const chart = queryClient.getQueryData(chartKey) as
                | { workspaceId?: string }
                | undefined;
            if (chart?.workspaceId) {
                queryClient.invalidateQueries({
                    queryKey: queryKeys.charts.sidebar(chart.workspaceId),
                });
            }
        },
        onError: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
            toast.error("Couldn't rename the chart");
        },
    });
};

/**
 * Deletes a chart. `had_data` on `chart_deleted` tells discarding a result
 * from tidying away an empty chart.
 */
export const useDeleteChart = () => {
    const queryClient = useQueryClient();
    const capture = useCapture();

    return useMutation({
        mutationKey: ["deleteChart"],
        mutationFn: ({ chartId }: { chartId: string; workspaceId: string }) => deleteChart(chartId),
        onMutate: ({ chartId }) => ItemAnalytics.chart(queryClient, chartId),
        onSuccess: (_, { chartId, workspaceId }, chart) => {
            capture("chart_deleted", {
                chart_id: chartId,
                workspace_id: workspaceId,
                tool: chart.tool,
                had_data: chart.had_data,
            });
            queryClient.invalidateQueries({ queryKey: queryKeys.charts.sidebar(workspaceId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
        },
    });
};

export const useCreateLogitLensChartPair = () => {
    const queryClient = useQueryClient();

    const defaultConfig: LogitLensConfigData = {
        prompt: "",
        model: "",
        topk: 5,
        includeEntropy: false,
    };

    return useMutation({
        mutationKey: ["createLogitLensChartPair"],
        mutationFn: async ({
            workspaceId,
            config = defaultConfig,
        }: {
            workspaceId: string;
            config?: LogitLensConfigData;
        }) => {
            return await createLogitLensChartPair(workspaceId, config);
        },
        onSuccess: (_, { workspaceId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.charts.sidebar(workspaceId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
        },
    });
};

export const useCreateJLensChartPair = () => {
    const queryClient = useQueryClient();

    const defaultConfig: JLensConfigData = {
        prompt: "",
        model: "",
        topk: 5,
        includeEntropy: false,
    };

    return useMutation({
        mutationKey: ["createJLensChartPair"],
        mutationFn: async ({
            workspaceId,
            config = defaultConfig,
        }: {
            workspaceId: string;
            config?: JLensConfigData;
        }) => {
            return await createJLensChartPair(workspaceId, config);
        },
        onSuccess: (_, { workspaceId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.charts.sidebar(workspaceId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
        },
    });
};

export const useCreatePatchLensChartPair = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: ["createPatchLensChartPair"],
        mutationFn: async ({ workspaceId }: { workspaceId: string }) => {
            return await createPatchLensChartPair(workspaceId);
        },
        onSuccess: (_, { workspaceId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.charts.sidebar(workspaceId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
        },
    });
};

/**
 * Creates the chart a `/new` launch describes (see `createChartFromLaunch`),
 * caches its chart and config so its page opens without fetching them, and
 * marks the lists it lands in as stale. They aren't refetched right away: a
 * server action that finishes while the chart's page is loading makes Next
 * load that page a second time. They refetch once the page has opened, when
 * its header mounts the library.
 */
export const useCreateChartFromLaunch = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: ["createChartFromLaunch"],
        mutationFn: (request: ChartLaunchRequest) => createChartFromLaunch(request),
        onSuccess: ({ chartId, chart, config, workspaceId }) => {
            queryClient.setQueryData(queryKeys.charts.chart(chartId), chart);
            queryClient.setQueryData(queryKeys.charts.configByChart(chartId), config);
            for (const queryKey of [
                queryKeys.workspaces.library,
                queryKeys.workspaces.all,
                queryKeys.charts.sidebar(workspaceId),
            ]) {
                queryClient.invalidateQueries({ queryKey, refetchType: "none" });
            }
        },
    });
};

/** Copies a chart; `chart_copied` names the copy as `chart_id`, so its later events join it. */
export const useCopyChart = () => {
    const queryClient = useQueryClient();
    const capture = useCapture();

    return useMutation({
        mutationKey: ["copyChart"],
        mutationFn: (chartId: string) => copyChart(chartId),
        onMutate: (chartId) => ItemAnalytics.chart(queryClient, chartId),
        onSuccess: (newChart, chartId, chart) => {
            capture("chart_copied", {
                chart_id: newChart.id,
                copied_from: chartId,
                workspace_id: newChart.workspaceId,
                tool: chart.tool,
                had_data: chart.had_data,
            });
            queryClient.invalidateQueries({
                queryKey: queryKeys.charts.sidebar(newChart.workspaceId),
            });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
        },
    });
};

export const useCreateActivationPatchingChartPair = () => {
    const queryClient = useQueryClient();

    const defaultConfig: ActivationPatchingConfigData = {
        model: "",
        srcPrompt: "",
        tgtPrompt: "",
        srcPos: null,
        tgtPos: null,
    };

    return useMutation({
        mutationKey: ["createActivationPatchingChartPair"],
        mutationFn: async ({
            workspaceId,
            config = defaultConfig,
        }: {
            workspaceId: string;
            config?: ActivationPatchingConfigData;
        }) => {
            return await createActivationPatchingChartPair(workspaceId, config);
        },
        onSuccess: (_, { workspaceId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.charts.sidebar(workspaceId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
        },
    });
};
