/**
 * Lens2 API - Full LogitLensKit V2 format visualization API
 */

import config from "@/lib/config";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setChartData } from "@/lib/queries/chartQueries";
import { Lens2ConfigData, Lens2Data } from "@/types/lens2";
import { queryKeys } from "../queryKeys";
import { toast } from "sonner";
import { startAndPoll } from "../startAndPoll";
import { createUserHeadersAction } from "@/actions/auth";

/**
 * API request for lens2 endpoint
 */
interface Lens2Request {
    completion: Lens2ConfigData;
    chartId: string;
}

/**
 * Fetch lens2 data from the backend
 */
const getLens2 = async (lensRequest: Lens2Request): Promise<Lens2Data> => {
    const headers = await createUserHeadersAction();

    // Transform to backend request format
    const request = {
        model: lensRequest.completion.model,
        prompt: lensRequest.completion.prompt,
        topk: lensRequest.completion.topk ?? 5,
        include_entropy: lensRequest.completion.includeEntropy ?? true,
    };

    return await startAndPoll<Lens2Data>(
        config.endpoints.startLens2,
        request,
        config.endpoints.resultsLens2,
        headers,
    );
};

/**
 * React Query mutation hook for lens2 visualization
 */
export const useLens2 = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: ["lens2"],
        onMutate: async ({
            lensRequest,
        }: {
            lensRequest: Lens2Request;
            configId: string;
        }) => {
            const chartKey = queryKeys.charts.chart(lensRequest.chartId);
            await queryClient.cancelQueries({ queryKey: chartKey });
            const previousChart = queryClient.getQueryData(chartKey);
            queryClient.setQueryData(chartKey, (old: unknown) => {
                if (!old) return old;
                return { ...(old as object), type: "lens2" };
            });
            return { previousChart, chartKey } as {
                previousChart: unknown;
                chartKey: ReturnType<typeof queryKeys.charts.chart>;
            };
        },
        mutationFn: async ({
            lensRequest,
        }: {
            lensRequest: Lens2Request;
            configId: string;
        }) => {
            const response = await getLens2(lensRequest);
            // Store the lens2 data as chart data (in V2 format)
            await setChartData(lensRequest.chartId, response, "lens2");
            return response;
        },
        onError: (error, variables, context) => {
            if (context?.previousChart) {
                queryClient.setQueryData(context.chartKey, context.previousChart);
            }
            toast.error("Failed to compute logit lens visualization");
        },
        onSuccess: async (data, variables) => {
            const chartKey = queryKeys.charts.chart(variables.lensRequest.chartId);
            await queryClient.invalidateQueries({ queryKey: chartKey });
            
            const chart = queryClient.getQueryData(chartKey) as { workspaceId?: string } | undefined;
            if (chart?.workspaceId) {
                queryClient.invalidateQueries({
                    queryKey: queryKeys.charts.sidebar(chart.workspaceId),
                });
                queryClient.invalidateQueries({
                    queryKey: queryKeys.charts.configByChart(variables.lensRequest.chartId),
                });
            }
        },
    });
};
