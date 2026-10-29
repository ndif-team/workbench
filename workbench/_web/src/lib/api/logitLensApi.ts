/**
 * Logit Lens API - Full LogitLensKit V2 format visualization API
 */

import config from "@/lib/config";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setChartData } from "@/lib/queries/chartQueries";
import type { LogitLensData } from "nnsightful";
import { LogitLensConfigData } from "@/types/logitLens";
import { queryKeys } from "../queryKeys";
import { toast } from "sonner";
import { runAndStream } from "../runAndStream";
import { createUserHeadersAction } from "@/actions/auth";

/**
 * API request for the logit lens endpoint
 */
interface LogitLensRequest {
    completion: LogitLensConfigData;
    chartId: string;
}

/**
 * Fetch logit lens data from the backend
 */
const getLogitLens = async (lensRequest: LogitLensRequest): Promise<LogitLensData> => {
    const headers = await createUserHeadersAction();

    // Transform to backend request format
    const request = {
        model: lensRequest.completion.model,
        prompt: lensRequest.completion.prompt,
        topk: lensRequest.completion.topk ?? 5,
        include_entropy: lensRequest.completion.includeEntropy ?? true,
    };

    return await runAndStream<LogitLensData>(config.endpoints.runLogitLens, request, headers);
};

/**
 * React Query mutation hook for logit lens visualization
 */
export const useLogitLens = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: ["logit-lens"],
        onMutate: async ({ lensRequest }: { lensRequest: LogitLensRequest; configId: string }) => {
            const chartKey = queryKeys.charts.chart(lensRequest.chartId);
            await queryClient.cancelQueries({ queryKey: chartKey });
            const previousChart = queryClient.getQueryData(chartKey);
            queryClient.setQueryData(chartKey, (old: unknown) => {
                if (!old) return old;
                return { ...(old as object), type: "logit-lens" };
            });
            return { previousChart, chartKey } as {
                previousChart: unknown;
                chartKey: ReturnType<typeof queryKeys.charts.chart>;
            };
        },
        mutationFn: async ({
            lensRequest,
        }: {
            lensRequest: LogitLensRequest;
            configId: string;
        }) => {
            const response = await getLogitLens(lensRequest);
            // Store the logit lens data as chart data (in V2 format)
            await setChartData(lensRequest.chartId, response, "logit-lens");
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

            // Do NOT invalidate configByChart here. The lens run is always
            // followed by `updateConfig` in the caller (LogitLensControls.handleSubmit
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
