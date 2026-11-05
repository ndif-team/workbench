/**
 * Activation Patching API - Handles activation patching visualization requests
 */

import config from "@/lib/config";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setChartData } from "@/lib/queries/chartQueries";
import {
    ActivationPatchingConfigData,
    ActivationPatchingData,
    ActivationPatchingApiRequest,
} from "@/types/activationPatching";
import { queryKeys } from "../queryKeys";
import { toast } from "sonner";
import { runAndStream } from "../runAndStream";
import { createUserHeadersAction } from "@/actions/auth";
import { useTrackRun, type RunTrigger } from "@/lib/analytics";
import { runErrorMessage } from "@/lib/ndifError";
import type { JobSink } from "@/lib/ndifJob";

/**
 * Internal request format for the mutation
 */
interface ActivationPatchingRequest {
    completion: ActivationPatchingConfigData;
    chartId: string;
}

interface ActivationPatchingVariables {
    request: ActivationPatchingRequest;
    configId: string;
    trigger: RunTrigger;
}

/**
 * Fetch activation patching data from the backend, recording its NDIF job in `jobs`
 */
const getActivationPatching = async (
    request: ActivationPatchingRequest,
    jobs: JobSink,
): Promise<ActivationPatchingData> => {
    const headers = await createUserHeadersAction();

    // Transform to backend request format
    const apiRequest: ActivationPatchingApiRequest = {
        model_name: request.completion.model,
        src_prompt: request.completion.srcPrompt,
        tgt_prompt: request.completion.tgtPrompt,
        src_pos: request.completion.srcPos ?? [],
        tgt_pos: request.completion.tgtPos ?? [],
        tgt_freeze: request.completion.tgtFreeze ?? [],
        token_ids: [], // Backend will use src_pred and clean_pred from results
    };

    return await runAndStream<ActivationPatchingData>(
        config.endpoints.runActivationPatching,
        apiRequest,
        headers,
        jobs,
    );
};

/**
 * React Query mutation hook for activation patching visualization. Each call
 * is one tracked run (`useTrackRun`); `meta.reportedAs` keeps its failures out
 * of exception capture, since `run_failed` reports them.
 */
export const useActivationPatching = () => {
    const queryClient = useQueryClient();
    const trackRun = useTrackRun();

    return useMutation({
        mutationKey: ["activationPatching"],
        meta: { reportedAs: "run" },
        onMutate: async ({ request }: ActivationPatchingVariables) => {
            const chartKey = queryKeys.charts.chart(request.chartId);
            await queryClient.cancelQueries({ queryKey: chartKey });
            const previousChart = queryClient.getQueryData(chartKey);
            queryClient.setQueryData(chartKey, (old: unknown) => {
                if (!old) return old;
                return { ...(old as object), type: "activation-patching" };
            });
            return { previousChart, chartKey } as {
                previousChart: unknown;
                chartKey: ReturnType<typeof queryKeys.charts.chart>;
            };
        },
        mutationFn: ({ request, trigger }: ActivationPatchingVariables) => {
            const { completion } = request;
            return trackRun(
                {
                    tool: "activation-patching",
                    trigger,
                    model: completion.model,
                    source_prompt_length: completion.srcPrompt.length,
                    target_prompt_length: completion.tgtPrompt.length,
                    src_pos_count: completion.srcPos?.length ?? 0,
                    tgt_pos_count: completion.tgtPos?.length ?? 0,
                    tgt_freeze_count: completion.tgtFreeze?.length ?? 0,
                },
                async (jobs) => {
                    const response = await getActivationPatching(request, jobs);
                    // Store the activation patching data as chart data
                    await setChartData(request.chartId, response, "activation-patching");
                    return response;
                },
            );
        },
        onError: (error, variables, context) => {
            if (context?.previousChart) {
                queryClient.setQueryData(context.chartKey, context.previousChart);
            }
            toast.error(
                runErrorMessage(error, "Failed to compute activation patching visualization"),
            );
        },
        onSuccess: async (data, variables) => {
            const chartKey = queryKeys.charts.chart(variables.request.chartId);
            await queryClient.invalidateQueries({ queryKey: chartKey });

            const chart = queryClient.getQueryData(chartKey) as
                | { workspaceId?: string }
                | undefined;
            if (chart?.workspaceId) {
                queryClient.invalidateQueries({
                    queryKey: queryKeys.charts.sidebar(chart.workspaceId),
                });
                queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
                // Note: We do NOT invalidate the config query here to avoid race conditions.
                // The config is invalidated by updateConfig after the new prompts are saved.
            }
        },
    });
};
