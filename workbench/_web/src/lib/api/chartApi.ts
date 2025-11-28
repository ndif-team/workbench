import config from "@/lib/config";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
    setChartData,
    deleteChart,
    createLensChartPair,
    createConceptLensChartPair,
    createPatchChartPair,
    updateChartName,
    updateChartView,
    copyChart,
} from "@/lib/queries/chartQueries";
import { LensConfigData, ConceptLensConfigData } from "@/types/lens";
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
        prompt: lensRequest.completion.prompt,
        metric: lensRequest.completion.statisticType,
        tokenPosition: lensRequest.completion.token.idx,
        targetIds: lensRequest.completion.token.targetIds,
    };

    return await startAndPoll<Line[]>(
        config.endpoints.logitLens,
        lineRequest,
        config.endpoints.logitLensLine,
        headers,
    );
};

export const useLensLine = () => {
    const queryClient = useQueryClient();
    const { clearView } = useLineView();
    const { captureChartThumbnail } = useCapture();

    return useMutation({
        mutationKey: ["lensLine"],
        onMutate: async ({
            lensRequest,
        }: {
            lensRequest: { completion: LensConfigData; chartId: string };
            configId: string;
        }) => {
            const chartKey = queryKeys.charts.chart(lensRequest.chartId);
            await queryClient.cancelQueries({ queryKey: chartKey });
            const previousChart = queryClient.getQueryData(chartKey);
            queryClient.setQueryData(chartKey, (old: any) => {
                if (!old) return old;
                return { ...old, type: "line" };
            });
            return { previousChart, chartKey } as {
                previousChart: unknown;
                chartKey: ReturnType<typeof queryKeys.charts.chart>;
            };
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
                queryClient.invalidateQueries({
                    queryKey: ["chartsForSidebar", chart.workspaceId],
                });
                queryClient.invalidateQueries({
                    queryKey: queryKeys.charts.configByChart(variables.lensRequest.chartId),
                });
            }
        },
    });
};

const getLensGrid = async (lensRequest: { completion: LensConfigData; chartId: string }) => {
    const headers = await createUserHeadersAction();

    // Transform LensConfigData to GridLensRequest format (logit-lens)
    const gridRequest = {
        model: lensRequest.completion.model,
        prompt: lensRequest.completion.prompt,
        metric: lensRequest.completion.statisticType,
    };

    return await startAndPoll<HeatmapRow[]>(
        config.endpoints.logitLens,
        gridRequest,
        config.endpoints.logitLensHeatmap,
        headers,
    );
};

const getConceptLensGrid = async (lensRequest: { completion: ConceptLensConfigData; chartId: string }) => {
    const headers = await createUserHeadersAction();

    // Transform ConceptLensConfigData to ConceptLensRequest format
    const conceptRequest = {
        model: lensRequest.completion.model,
        prompt: lensRequest.completion.prompt,
        tokenPosition: lensRequest.completion.token?.idx,
    };

    return await startAndPoll<HeatmapRow[]>(
        config.endpoints.conceptLens,
        conceptRequest,
        config.endpoints.conceptLensHeatmap,
        headers,
    );
};

export const useLensGrid = () => {
    const queryClient = useQueryClient();
    const { clearView } = useHeatmapView();
    const { captureChartThumbnail } = useCapture();

    return useMutation({
        mutationKey: ["lensGrid"],
        onMutate: async ({
            lensRequest,
        }: {
            lensRequest: { completion: LensConfigData; chartId: string };
            configId: string;
        }) => {
            const chartKey = queryKeys.charts.chart(lensRequest.chartId);
            await queryClient.cancelQueries({ queryKey: chartKey });
            const previousChart = queryClient.getQueryData(chartKey);
            queryClient.setQueryData(chartKey, (old: any) => {
                if (!old) return old;
                return { ...old, type: "heatmap" };
            });
            return { previousChart, chartKey } as {
                previousChart: unknown;
                chartKey: ReturnType<typeof queryKeys.charts.chart>;
            };
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
            toast.error("Failed to compute logit lens (timeout or error)");
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
                queryClient.invalidateQueries({
                    queryKey: ["chartsForSidebar", chart.workspaceId],
                });
                queryClient.invalidateQueries({
                    queryKey: queryKeys.charts.configByChart(variables.lensRequest.chartId),
                });
            }
        },
    });
};

export const useConceptLensGrid = () => {
    const queryClient = useQueryClient();
    const { clearView } = useHeatmapView();
    const { captureChartThumbnail } = useCapture();

    return useMutation({
        mutationKey: ["conceptLensGrid"],
        onMutate: async ({
            lensRequest,
        }: {
            lensRequest: { completion: ConceptLensConfigData; chartId: string };
            configId: string;
        }) => {
            const chartKey = queryKeys.charts.chart(lensRequest.chartId);
            await queryClient.cancelQueries({ queryKey: chartKey });
            const previousChart = queryClient.getQueryData(chartKey);
            queryClient.setQueryData(chartKey, (old: any) => {
                if (!old) return old;
                return { ...old, type: "heatmap" };
            });
            return { previousChart, chartKey } as {
                previousChart: unknown;
                chartKey: ReturnType<typeof queryKeys.charts.chart>;
            };
        },
        mutationFn: async ({
            lensRequest,
            configId,
        }: {
            lensRequest: { completion: ConceptLensConfigData; chartId: string };
            configId: string;
        }) => {
            const response = await getConceptLensGrid(lensRequest);
            await setChartData(lensRequest.chartId, response, "heatmap");
            return response;
        },
        onError: (error, variables, context) => {
            if (context?.previousChart) {
                queryClient.setQueryData(context.chartKey, context.previousChart as any);
            }
            toast.error("Failed to compute concept lens (timeout or error)");
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
                queryClient.invalidateQueries({
                    queryKey: ["chartsForSidebar", chart.workspaceId],
                });
                queryClient.invalidateQueries({
                    queryKey: queryKeys.charts.configByChart(variables.lensRequest.chartId),
                });
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

export const useCreateConceptLensChartPair = () => {
    const queryClient = useQueryClient();

    const defaultConfig = {
        prompt: "",
        model: "",
        token: { idx: 0, id: 0, text: "", targetIds: [] },
        statisticType: "probability" as const,
    } as ConceptLensConfigData;

    return useMutation({
        mutationFn: async ({
            workspaceId,
            config = defaultConfig,
        }: {
            workspaceId: string;
            config?: ConceptLensConfigData;
        }) => {
            return await createConceptLensChartPair(workspaceId, config);
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
