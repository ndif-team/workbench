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

/**
 * Internal request format for the mutation
 */
interface ActivationPatchingRequest {
    completion: ActivationPatchingConfigData;
    chartId: string;
}

/**
 * Fetch activation patching data from the backend
 */
const getActivationPatching = async (
    request: ActivationPatchingRequest,
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
        token_ids: [],  // Backend will use src_pred and clean_pred from results
    };

    return await runAndStream<ActivationPatchingData>(
        config.endpoints.runActivationPatching,
        apiRequest,
        headers,
    );
};

/**
 * React Query mutation hook for activation patching visualization
 */
export const useActivationPatching = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: ["activationPatching"],
        onMutate: async ({
            request,
        }: {
            request: ActivationPatchingRequest;
            configId: string;
        }) => {
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
        mutationFn: async ({
            request,
        }: {
            request: ActivationPatchingRequest;
            configId: string;
        }) => {
            const response = await getActivationPatching(request);
            // Store the activation patching data as chart data
            await setChartData(request.chartId, response, "activation-patching");
            return response;
        },
        onError: (error, variables, context) => {
            if (context?.previousChart) {
                queryClient.setQueryData(context.chartKey, context.previousChart);
            }
            toast.error("Failed to compute activation patching visualization");
        },
        onSuccess: async (data, variables) => {
            const chartKey = queryKeys.charts.chart(variables.request.chartId);
            await queryClient.invalidateQueries({ queryKey: chartKey });

            // Invalidate sidebar to update chart type display
            const chart = queryClient.getQueryData(chartKey) as
                | { workspaceId?: string }
                | undefined;
            if (chart?.workspaceId) {
                queryClient.invalidateQueries({
                    queryKey: ["chartsForSidebar", chart.workspaceId],
                });
                // Note: We do NOT invalidate the config query here to avoid race conditions.
                // The config is invalidated by updateConfig after the new prompts are saved.
            }
        },
    });
};
