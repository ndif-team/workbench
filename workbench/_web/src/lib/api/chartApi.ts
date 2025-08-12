import config from "@/lib/config";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setChartData, createChart, deleteChart, createLensChartPair, createPatchChartPair, updateChartName, upsertChartThumbnail } from "@/lib/queries/chartQueries";
import sseService from "@/lib/sseProvider";
import { LensConfigData } from "@/types/lens";
import { PatchingConfig } from "@/types/patching";
import { NewChart } from "@/db/schema";
import { useWorkspace } from "@/stores/useWorkspace";
import { LineGraphData, HeatmapData } from "@/types/charts"

const getLensLine = async (lensRequest: { completion: LensConfigData; chartId: string }) => {
    try {
        const response = await fetch(config.getApiUrl(config.endpoints.getLensLine), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(lensRequest.completion),
        });

        if (!response.ok) throw new Error("Failed to start lens computation");
        const {job_id: jobId} = await response.json();
        const result = await sseService.listenToSSE<LineGraphData>(config.endpoints.listenLensLine + `/${jobId}`);
        return { data: result };
    } catch (error) {
        console.error("Error fetching logit lens data:", error);
        throw error;
    }
}

export const useLensLine = () => {
    const queryClient = useQueryClient();
    const { requestThumbnailCapture } = useWorkspace();

    return useMutation({
        mutationFn: async ({lensRequest, configId}: { lensRequest: { completion: LensConfigData; chartId: string }; configId: string }) => {
            const response = await getLensLine(lensRequest);
            await setChartData(lensRequest.chartId, response.data, "line");
            return response.data;
        },
        onSuccess: (data, variables) => {
            // Invalidate queries to refresh the UI with updated data
            queryClient.invalidateQueries({ 
                queryKey: ["lensCharts"] 
            });
            // Ensure the single-chart view refreshes as well
            if (variables?.lensRequest?.chartId) {
                queryClient.invalidateQueries({
                    queryKey: ["chartById", variables.lensRequest.chartId],
                });
                requestThumbnailCapture(variables.lensRequest.chartId);
            }
            queryClient.invalidateQueries({ 
                queryKey: ["unlinkedCharts"] 
            });
            queryClient.invalidateQueries({ 
                queryKey: ["hasLinkedConfig"] 
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
        const {job_id: jobId} = await response.json();
        const result = await sseService.listenToSSE<HeatmapData>(config.endpoints.listenLensGrid + `/${jobId}`);
        return { data: result };
    } catch (error) {
        console.error("Error fetching grid lens data:", error);
        throw error;
    }
}


export const useLensGrid = () => {
    const queryClient = useQueryClient();
    const { requestThumbnailCapture } = useWorkspace();

    return useMutation({
        mutationFn: async ({ lensRequest, configId }: { lensRequest: {completion: LensConfigData; chartId: string}; configId: string }) => {
            const response = await getLensGrid(lensRequest);
            await setChartData(lensRequest.chartId, response.data, "heatmap");
            return response.data;
        },
        onSuccess: (data, variables) => {
            // Invalidate queries to refresh the UI with updated data
            queryClient.invalidateQueries({ 
                queryKey: ["lensCharts"] 
            });
            // Ensure the single-chart view refreshes as well
            if (variables?.lensRequest?.chartId) {
                queryClient.invalidateQueries({
                    queryKey: ["chartById", variables.lensRequest.chartId],
                });
                requestThumbnailCapture(variables.lensRequest.chartId);
            }
            queryClient.invalidateQueries({ 
                queryKey: ["unlinkedCharts"] 
            });
            queryClient.invalidateQueries({ 
                queryKey: ["hasLinkedConfig"] 
            });
        },
        onError: (error, variables) => {
            console.error("Error fetching logit lens data:", error);
        },
    });
}

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

export const useDeleteChart = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (chartId: string) => deleteChart(chartId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["lensCharts"] });
            queryClient.invalidateQueries({ queryKey: ["unlinkedCharts"] });
            queryClient.invalidateQueries({ queryKey: ["hasLinkedConfig"] });
            queryClient.invalidateQueries({ queryKey: ["chartsForSidebar"] });
        },
    });
};

export const useCreateLensChartPair = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ workspaceId, defaultConfig }: { workspaceId: string; defaultConfig: LensConfigData }) => {
            return await createLensChartPair(workspaceId, defaultConfig);
        },
        onSuccess: ({ chart }) => {
            // Refresh charts and configs
            queryClient.invalidateQueries({ queryKey: ["lensCharts"] });
            queryClient.invalidateQueries({ queryKey: ["unlinkedCharts"] });
            queryClient.invalidateQueries({ queryKey: ["chartConfig"] });
            queryClient.invalidateQueries({ queryKey: ["chartsForSidebar"] });
        },
    });
};

export const useCreatePatchChartPair = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ workspaceId, defaultConfig }: { workspaceId: string; defaultConfig: PatchingConfig }) => {
            return await createPatchChartPair(workspaceId, defaultConfig);
        },
        onSuccess: ({ chart }) => {
            // Refresh charts and configs
            queryClient.invalidateQueries({ queryKey: ["patchCharts"] });
            queryClient.invalidateQueries({ queryKey: ["unlinkedCharts"] });
            queryClient.invalidateQueries({ queryKey: ["chartConfig"] });
            queryClient.invalidateQueries({ queryKey: ["chartsForSidebar"] });
        },
    });
};