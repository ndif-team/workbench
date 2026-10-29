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
import type { WorkspaceLibrary } from "@/types/workspaces";

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

export const useUpdateChartName = () => {
    const queryClient = useQueryClient();

    return useMutation({
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

export const useDeleteChart = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ chartId }: { chartId: string; workspaceId: string }) => deleteChart(chartId),
        onSuccess: (_, { workspaceId }) => {
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
        includeEntropy: true,
    };

    return useMutation({
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
        includeEntropy: true,
    };

    return useMutation({
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
 * Creates the chart a `/new` launch describes (see `createChartFromLaunch`)
 * and refreshes the lists it lands in.
 */
export const useCreateChartFromLaunch = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (request: ChartLaunchRequest) => createChartFromLaunch(request),
        onSuccess: ({ workspaceId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.charts.sidebar(workspaceId) });
        },
    });
};

export const useCopyChart = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (chartId: string) => copyChart(chartId),
        onSuccess: (newChart) => {
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
