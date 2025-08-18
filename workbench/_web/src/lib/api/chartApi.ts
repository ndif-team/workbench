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
import sseService from "@/lib/sseProvider";
import { LensConfigData } from "@/types/lens";
import { PatchingConfig } from "@/types/patching";
import { useCapture } from "@/components/providers/CaptureProvider";
import { LineGraphData, HeatmapData, ChartData, ChartView } from "@/types/charts";
import { queryKeys } from "@/lib/queryKeys";

const getLensLine = async (lensRequest: { completion: LensConfigData; chartId: string }) => {
    try {
        const response = await fetch(config.getApiUrl(config.endpoints.getLensLine), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(lensRequest.completion),
        });

        if (!response.ok) throw new Error("Failed to start lens computation");
        const { job_id: jobId } = await response.json();
        const result = await sseService.listenToSSE<LineGraphData>(
            config.endpoints.listenLensLine + `/${jobId}`
        );
        return { data: result };
    } catch (error) {
        console.error("Error fetching logit lens data:", error);
        throw error;
    }
};

export const useLensLine = () => {
    const queryClient = useQueryClient();
    const { captureChartThumbnail } = useCapture();

    return useMutation({
        mutationFn: async ({
            lensRequest,
            configId,
        }: {
            lensRequest: { completion: LensConfigData; chartId: string };
            configId: string;
        }) => {
            const response = await getLensLine(lensRequest);
            await setChartData(lensRequest.chartId, response.data, "line");
            return response.data;
        },
        onSuccess: (data, variables) => {
            // Invalidate queries to refresh the UI with updated data
            queryClient.invalidateQueries({
                queryKey: queryKeys.charts.all,
            });
            // Ensure the single-chart view refreshes as well
            queryClient
                .invalidateQueries({
                    queryKey: queryKeys.charts.byId(variables.lensRequest.chartId),
                })
                .then(() => {
                    setTimeout(() => {
                        captureChartThumbnail(variables.lensRequest.chartId);
                    }, 500);
                });
        },
        onError: (error, variables) => {
            console.error("Error fetching logit lens data:", error);
        },
    });
};

const getLensGrid = async (lensRequest: { completion: LensConfigData; chartId: string }) => {
    try {
        const response = await fetch(config.getApiUrl(config.endpoints.getLensGrid), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(lensRequest.completion),
        });

        if (!response.ok) throw new Error("Failed to start grid lens computation");
        const { job_id: jobId } = await response.json();
        const result = await sseService.listenToSSE<HeatmapData>(
            config.endpoints.listenLensGrid + `/${jobId}`
        );
        return { data: result };
    } catch (error) {
        console.error("Error fetching grid lens data:", error);
        throw error;
    }
};

export const useLensGrid = () => {
    const queryClient = useQueryClient();
    const { captureChartThumbnail } = useCapture();

    return useMutation({
        mutationFn: async ({
            lensRequest,
            configId,
        }: {
            lensRequest: { completion: LensConfigData; chartId: string };
            configId: string;
        }) => {
            const response = await getLensGrid(lensRequest);
            await setChartData(lensRequest.chartId, response.data, "heatmap");
            return response.data;
        },
        onSuccess: (data, variables) => {
            // Invalidate queries to refresh the UI with updated data
            queryClient.invalidateQueries({
                queryKey: queryKeys.charts.all,
            });
            // Ensure the single-chart view refreshes as well
            queryClient
                .invalidateQueries({
                    queryKey: queryKeys.charts.byId(variables.lensRequest.chartId),
                })
                .then(() => {
                    // Wait for chart to rerender before capturing thumbnail
                    setTimeout(() => {
                        captureChartThumbnail(variables.lensRequest.chartId);
                    }, 500);
                });
        },
        onError: (error, variables) => {
            console.error("Error fetching logit lens data:", error);
        },
    });
};

export const useUpdateChartName = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ chartId, name }: { chartId: string; name: string }) => {
            return await updateChartName(chartId, name);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["chartById"] });
        },
    });
};

export const useUpdateChartView = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ chartId, view }: { chartId: string; view: ChartView }) => {
            return await updateChartView(chartId, view);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["chartById"] });
        },
    });
};

export const useDeleteChart = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (chartId: string) => deleteChart(chartId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.charts.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.charts.sidebar("") });
        },
    });
};

export const useCreateLensChartPair = () => {
    const queryClient = useQueryClient();

    const defaultConfig = {
        prompt: "",
        model: "",
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
            // Refresh charts and configs
            queryClient.invalidateQueries({ queryKey: queryKeys.charts.all });
            queryClient.invalidateQueries({ queryKey: ["chartConfig"] });
            queryClient.invalidateQueries({ queryKey: ["chartsForSidebar"] });
        },
    });
};

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
            queryClient.invalidateQueries({ queryKey: queryKeys.charts.patchAll });
            queryClient.invalidateQueries({ queryKey: ["chartConfig"] });
            queryClient.invalidateQueries({ queryKey: ["chartsForSidebar"] });
        },
    });
};

export const useCopyChart = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (chartId: string) => copyChart(chartId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.charts.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.charts.patchAll });
            queryClient.invalidateQueries({ queryKey: ["chartsForSidebar"] });
        },
    });
};
