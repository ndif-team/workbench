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
import { useTrackRun, type RunTrigger } from "@/lib/analytics";
import { runErrorMessage } from "@/lib/ndifError";

/**
 * API request for the logit lens endpoint
 */
interface LogitLensRequest {
    completion: LogitLensConfigData;
    chartId: string;
}

interface LogitLensVariables {
    lensRequest: LogitLensRequest;
    configId: string;
    trigger: RunTrigger;
}

/** The backend request for a logit lens config. */
const toRequest = ({ model, prompt, topk, includeEntropy }: LogitLensConfigData) => ({
    model,
    prompt,
    topk: topk ?? 5,
    include_entropy: includeEntropy ?? false,
});

/**
 * React Query mutation hook for logit lens visualization. Each call is one
 * tracked run (`useTrackRun`); `meta.reportedAs` keeps its failures out of
 * exception capture, since `run_failed` reports them.
 */
export const useLogitLens = () => {
    const queryClient = useQueryClient();
    const trackRun = useTrackRun();

    return useMutation({
        mutationKey: ["logit-lens"],
        meta: { reportedAs: "run" },
        onMutate: async ({ lensRequest }: LogitLensVariables) => {
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
        mutationFn: ({ lensRequest, trigger }: LogitLensVariables) => {
            const request = toRequest(lensRequest.completion);
            return trackRun(
                {
                    tool: "logit-lens",
                    trigger,
                    model: request.model,
                    prompt: request.prompt,
                    prompt_length: request.prompt.length,
                    topk: request.topk,
                    include_entropy: request.include_entropy,
                },
                async (jobs) => {
                    const headers = await createUserHeadersAction();
                    const response = await runAndStream<LogitLensData>(
                        config.endpoints.runLogitLens,
                        request,
                        headers,
                        jobs,
                    );
                    // Store the logit lens data as chart data (in V2 format)
                    await setChartData(lensRequest.chartId, response, "logit-lens");
                    return response;
                },
            );
        },
        onError: (error, variables, context) => {
            if (context?.previousChart) {
                queryClient.setQueryData(context.chartKey, context.previousChart);
            }
            toast.error(runErrorMessage(error, "Failed to compute logit lens visualization"));
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
                queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
            }
        },
    });
};
