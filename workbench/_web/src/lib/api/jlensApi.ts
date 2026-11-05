/**
 * J-Lens API - Jacobian lens visualization API (reuses the LogitLens data format)
 */

import config from "@/lib/config";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setChartData } from "@/lib/queries/chartQueries";
import { JLensConfigData, JLensData } from "@/types/jlens";
import { queryKeys } from "../queryKeys";
import { toast } from "sonner";
import { runAndStream } from "../runAndStream";
import { createUserHeadersAction } from "@/actions/auth";
import { useTrackRun, type RunTrigger } from "@/lib/analytics";
import { runErrorMessage } from "@/lib/ndifError";

/**
 * API request for j-lens endpoint
 */
interface JLensRequest {
    completion: JLensConfigData;
    chartId: string;
}

interface JLensVariables {
    lensRequest: JLensRequest;
    configId: string;
    trigger: RunTrigger;
}

/** The backend request for a j-lens config. */
const toRequest = ({ model, prompt, topk, includeEntropy }: JLensConfigData) => ({
    model,
    prompt,
    topk: topk ?? 5,
    include_entropy: includeEntropy ?? false,
});

/**
 * React Query mutation hook for j-lens visualization. Each call is one tracked
 * run (`useTrackRun`); `meta.reportedAs` keeps its failures out of exception
 * capture, since `run_failed` reports them.
 */
export const useJLens = () => {
    const queryClient = useQueryClient();
    const trackRun = useTrackRun();

    return useMutation({
        mutationKey: ["jlens"],
        meta: { reportedAs: "run" },
        onMutate: async ({ lensRequest }: JLensVariables) => {
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
        mutationFn: ({ lensRequest, trigger }: JLensVariables) => {
            const request = toRequest(lensRequest.completion);
            return trackRun(
                {
                    tool: "jlens",
                    trigger,
                    model: request.model,
                    prompt_length: request.prompt.length,
                    topk: request.topk,
                    include_entropy: request.include_entropy,
                },
                async (jobs) => {
                    const headers = await createUserHeadersAction();
                    const response = await runAndStream<JLensData>(
                        config.endpoints.runJLens,
                        request,
                        headers,
                        jobs,
                    );
                    // Store the j-lens data as chart data (in LogitLens V2 format)
                    await setChartData(lensRequest.chartId, response, "jlens");
                    return response;
                },
            );
        },
        onError: (error, variables, context) => {
            if (context?.previousChart) {
                queryClient.setQueryData(context.chartKey, context.previousChart);
            }
            toast.error(runErrorMessage(error, "Failed to compute j-lens visualization"));
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
                queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
            }
        },
    });
};
