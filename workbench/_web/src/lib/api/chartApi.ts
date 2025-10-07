import config from "@/lib/config";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
    setChartData,
    deleteChart,
    createLensChartPair,
    createPatchChartPair,
    updateChartName,
    updateChartView,
    copyChart,
} from "@/lib/queries/chartQueries";
import { LensConfigData } from "@/types/lens";
import { PatchingConfig } from "@/types/patching";
import { useCapture } from "@/components/providers/CaptureProvider";
import { Line, HeatmapRow, ChartView } from "@/types/charts";
import { queryKeys } from "../queryKeys";
import { toast } from "sonner";
import { startAndPoll } from "../startAndPoll";
import { useHeatmapView, useLineView } from "@/components/charts/ViewProvider";
import { createUserHeadersAction } from "@/actions/auth";

const getLensLine = async (lensRequest: { completion: LensConfigData; chartId: string }) => {
    const headers = await createUserHeadersAction();
    
    // Transform LensConfigData to LensLineRequest format
    const lineRequest = {
        model: lensRequest.completion.model,
        stat: lensRequest.completion.statisticType,
        prompt: lensRequest.completion.prompt,
        token: lensRequest.completion.token,
    };
    
    return await startAndPoll<Line[]>(
        config.endpoints.startLensLine,
        lineRequest,
        config.endpoints.resultsLensLine,
        headers
    );
};

export const useLensLine = () => {
    const queryClient = useQueryClient();   
    const { clearView } = useLineView();
    const { captureChartThumbnail } = useCapture();

    return useMutation({
        mutationKey: ["lensLine"],
        onMutate: async ({ lensRequest }: { lensRequest: { completion: LensConfigData; chartId: string }; configId: string }) => {
            const chartKey = queryKeys.charts.chart(lensRequest.chartId);
            await queryClient.cancelQueries({ queryKey: chartKey });
            const previousChart = queryClient.getQueryData(chartKey);
            queryClient.setQueryData(chartKey, (old: any) => {
                if (!old) return old;
                return { ...old, type: "line" };
            });
            return { previousChart, chartKey } as { previousChart: unknown; chartKey: ReturnType<typeof queryKeys.charts.chart> };
        },
        mutationFn: async ({
            lensRequest,
            configId,
        }: {
            lensRequest: { completion: LensConfigData; chartId: string };
            configId: string;
        }) => {
            const response = await getLensLine(lensRequest);
            await setChartData(lensRequest.chartId, response, "line");
            return response;
        },
        onError: (error, variables, context) => {
            if (context?.previousChart) {
                queryClient.setQueryData(context.chartKey, context.previousChart as any);
            }
            toast.error("Failed to compute lens line (timeout or error)");
        },
        onSuccess: async (data, variables) => {
            await clearView();
            const chartKey = queryKeys.charts.chart(variables.lensRequest.chartId);
            queryClient
                .invalidateQueries({
                    queryKey: chartKey,
                })
                .then(() => {
                    setTimeout(() => {
                        captureChartThumbnail(variables.lensRequest.chartId);
                    }, 500);
                });
            // Invalidate sidebar to update chart type display
            // Get the chart to find workspaceId for proper cache invalidation
            const chart = queryClient.getQueryData(chartKey) as any;
            if (chart?.workspaceId) {
                queryClient.invalidateQueries({ queryKey: ["chartsForSidebar", chart.workspaceId] });
                queryClient.invalidateQueries({ queryKey: queryKeys.charts.configByChart(variables.lensRequest.chartId) });
            }
        },
    });
};

const getLensGrid = async (lensRequest: { completion: LensConfigData; chartId: string }) => {
    const headers = await createUserHeadersAction();
    
    // Transform LensConfigData to GridLensRequest format
    const gridRequest = {
        model: lensRequest.completion.model,
        stat: lensRequest.completion.statisticType,
        prompt: lensRequest.completion.prompt,       
    };
    
    return await startAndPoll<HeatmapRow[]>(
        config.endpoints.startLensGrid,
        gridRequest,
        config.endpoints.resultsLensGrid,
        headers
    );
};

export const useLensGrid = () => {
    const queryClient = useQueryClient();
    const { clearView } = useHeatmapView();
    const { captureChartThumbnail } = useCapture();

    return useMutation({
        mutationKey: ["lensGrid"],
        onMutate: async ({ lensRequest }: { lensRequest: { completion: LensConfigData; chartId: string }; configId: string }) => {
            const chartKey = queryKeys.charts.chart(lensRequest.chartId);
            await queryClient.cancelQueries({ queryKey: chartKey });
            const previousChart = queryClient.getQueryData(chartKey);
            queryClient.setQueryData(chartKey, (old: any) => {
                if (!old) return old;
                return { ...old, type: "heatmap" };
            });
            return { previousChart, chartKey } as { previousChart: unknown; chartKey: ReturnType<typeof queryKeys.charts.chart> };
        },
        mutationFn: async ({
            lensRequest,
            configId,
        }: {
            lensRequest: { completion: LensConfigData; chartId: string };
            configId: string;
        }) => {
            const response = await getLensGrid(lensRequest);
            await setChartData(lensRequest.chartId, response, "heatmap");
            return response;
        },
        onError: (error, variables, context) => {
            if (context?.previousChart) {
                queryClient.setQueryData(context.chartKey, context.previousChart as any);
            }
            toast.error("Failed to compute grid lens (timeout or error)");
        },
        onSuccess: async (data, variables) => {
            await clearView();
            const chartKey = queryKeys.charts.chart(variables.lensRequest.chartId);
            queryClient
                .invalidateQueries({
                    queryKey: chartKey,
                })
                .then(() => {
                    setTimeout(() => {
                        captureChartThumbnail(variables.lensRequest.chartId);
                    }, 500);
                });
            // Invalidate sidebar to update chart type display
            // Get the chart to find workspaceId for proper cache invalidation
            const chart = queryClient.getQueryData(chartKey) as any;
            if (chart?.workspaceId) {
                queryClient.invalidateQueries({ queryKey: ["chartsForSidebar", chart.workspaceId] });
                queryClient.invalidateQueries({ queryKey: queryKeys.charts.configByChart(variables.lensRequest.chartId) });
            }
        },
    });
};

export const useUpdateChartName = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ chartId, name }: { chartId: string; name: string }) => {
            return await updateChartName(chartId, name);
        },
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.charts.chart(variables.chartId) });
        },
    });
};

export const useUpdateChartView = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ chartId, view }: { chartId: string; view: ChartView }) => {
            return await updateChartView(chartId, view);
        },
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.charts.chart(variables.chartId) });
        },
    });
};

export const useDeleteChart = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (chartId: string) => deleteChart(chartId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.charts.sidebar() });
        },
    });
};

export const useCreateLensChartPair = () => {
    const queryClient = useQueryClient();

    const defaultConfig = {
        prompt: "",
        model: "",
        statisticType: "probability" as const,
        token: { idx: 0, id: 0, text: "", targetIds: [] },
    } as LensConfigData;

    return useMutation({
        mutationFn: async ({
            workspaceId,
            config = defaultConfig,
        }: {
            workspaceId: string;
            config?: LensConfigData;
        }) => {
            return await createLensChartPair(workspaceId, config);
        },
        onSuccess: ({ chart }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.charts.sidebar() });
        },
    });
};

// TODO(cadentj): FIX THIS
export const useCreatePatchChartPair = () => {
    const queryClient = useQueryClient();

    const defaultConfig = {
        edits: [],
        model: "",
        source: "",
        destination: "",
        submodule: "attn",
        correctId: 0,
        incorrectId: undefined,
        patchTokens: false,
    } as PatchingConfig;

    return useMutation({
        mutationFn: async ({
            workspaceId,
            config = defaultConfig,
        }: {
            workspaceId: string;
            config?: PatchingConfig;
        }) => {
            return await createPatchChartPair(workspaceId, config);
        },
        onSuccess: ({ chart }) => {
            // Refresh charts and configs
            queryClient.invalidateQueries({ queryKey: ["patchCharts"] });
            // Note: This invalidates all chart configs - consider if this is needed
            queryClient.invalidateQueries({ queryKey: ["chartsForSidebar", chart.workspaceId] });
        },
    });
};

export const useCopyChart = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (chartId: string) => copyChart(chartId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.charts.sidebar() });
        },
    });
};
