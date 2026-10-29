import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
    deleteChart,
    createLogitLensChartPair,
    createJLensChartPair,
    createPatchLensChartPair,
    createActivationPatchingChartPair,
    updateChartName,
    copyChart,
} from "@/lib/queries/chartQueries";
import { LogitLensConfigData } from "@/types/logitLens";
import { JLensConfigData } from "@/types/jlens";
import { ActivationPatchingConfigData } from "@/types/activationPatching";
import { queryKeys } from "../queryKeys";

export const useUpdateChartName = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ chartId, name }: { chartId: string; name: string }) => {
            return await updateChartName(chartId, name);
        },
        onSuccess: (data, variables) => {
            const chartKey = queryKeys.charts.chart(variables.chartId);
            queryClient.invalidateQueries({ queryKey: chartKey });

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
    });
};

export const useDeleteChart = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ chartId }: { chartId: string; workspaceId: string }) => deleteChart(chartId),
        onSuccess: (_, { workspaceId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.charts.sidebar(workspaceId) });
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
        },
    });
};
