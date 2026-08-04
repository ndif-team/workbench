/**
 * J-Lens API - Jacobian lens visualization API (reuses the LogitLens data format)
 */

import config from "@/lib/config";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setChartData } from "@/lib/queries/chartQueries";
import { JLensConfigData, JLensData } from "@/types/jlens";
import { queryKeys } from "../queryKeys";
import { toast } from "sonner";
import { startAndPoll } from "../startAndPoll";
import { createUserHeadersAction } from "@/actions/auth";

/**
 * API request for j-lens endpoint
 */
interface JLensRequest {
    completion: JLensConfigData;
    chartId: string;
}

/**
 * Fetch j-lens data from the backend
 */
const getJLens = async (lensRequest: JLensRequest): Promise<JLensData> => {
    const headers = await createUserHeadersAction();

    // Transform to backend request format
    const request = {
        model: lensRequest.completion.model,
        prompt: lensRequest.completion.prompt,
        topk: lensRequest.completion.topk ?? 5,
        include_entropy: lensRequest.completion.includeEntropy ?? true,
    };

    return await startAndPoll<JLensData>(
        config.endpoints.startJLens,
        request,
        config.endpoints.resultsJLens,
        headers,
    );
};

/**
 * React Query mutation hook for j-lens visualization
 */
export const useJLens = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: ["jlens"],
        onMutate: async ({ lensRequest }: { lensRequest: JLensRequest; configId: string }) => {
            const chartKey = queryKeys.charts.chart(lensRequest.chartId);
            await queryClient.cancelQueries({ queryKey: chartKey });
            const previousChart = queryClient.getQueryData(chartKey);
            queryClient.setQueryData(chartKey, (old: unknown) => {
                if (!old) return old;
                return { ...(old as object), type: "jlens" };
            });
            return { previousChart, chartKey } as {
                previousChart: unknown;
                chartKey: ReturnType<typeof queryKeys.charts.chart>;
            };
        },
        mutationFn: async ({ lensRequest }: { lensRequest: JLensRequest; configId: string }) => {
            const response = await getJLens(lensRequest);
            // Store the j-lens data as chart data (in LogitLens V2 format)
            await setChartData(lensRequest.chartId, response, "jlens");
            return response;
        },
        onError: (error, variables, context) => {
            if (context?.previousChart) {
                queryClient.setQueryData(context.chartKey, context.previousChart);
            }
            toast.error("Failed to compute j-lens visualization");
        },
        onSuccess: async (data, variables) => {
            const chartKey = queryKeys.charts.chart(variables.lensRequest.chartId);
            await queryClient.invalidateQueries({ queryKey: chartKey });

            // Do NOT invalidate configByChart here. The lens run is always
            // followed by `updateConfig` in the caller (JLensControls.handleSubmit
            // and the auto-run effect), and useUpdateChartConfig owns that
            // invalidation. Triggering it here races the in-flight config write
            // and can cache the pre-write (stale) row.
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
