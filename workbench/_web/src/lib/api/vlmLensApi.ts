/**
 * VLM Logit Lens API.
 *
 * Mirrors lensApi.ts (lens2). The only material difference is that the
 * request body carries the image as base64 alongside the prompt; the
 * polling/results flow is the same start->poll->results dance via
 * startAndPoll, since NDIF handles VLM traces identically to LM traces.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { createUserHeadersAction } from "@/actions/auth";
import { setChartData } from "@/lib/queries/chartQueries";
import { VlmLensData } from "@/types/vlmLens";

import config from "@/lib/config";
import { queryKeys } from "../queryKeys";
import { startAndPoll } from "../startAndPoll";

export interface VlmLensRequest {
    chartId: string;
    model: string;
    prompt: string;
    topK?: number;
    imageB64: string; // raw base64 (no data: prefix)
}

const getVlmLens = async (req: VlmLensRequest): Promise<VlmLensData> => {
    const headers = await createUserHeadersAction();
    const body = {
        model: req.model,
        prompt: req.prompt,
        image_b64: req.imageB64,
        top_k: req.topK ?? 5,
    };
    return await startAndPoll<VlmLensData>(
        config.endpoints.startVlmLens,
        body,
        config.endpoints.resultsVlmLens,
        headers,
    );
};

export const useVlmLens = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: ["vlm-lens"],
        onMutate: async ({ request }: { request: VlmLensRequest; configId: string }) => {
            const chartKey = queryKeys.charts.chart(request.chartId);
            await queryClient.cancelQueries({ queryKey: chartKey });
            const previousChart = queryClient.getQueryData(chartKey);
            queryClient.setQueryData(chartKey, (old: unknown) => {
                if (!old) return old;
                return { ...(old as object), type: "vlm-lens" };
            });
            return { previousChart, chartKey } as {
                previousChart: unknown;
                chartKey: ReturnType<typeof queryKeys.charts.chart>;
            };
        },
        mutationFn: async ({ request }: { request: VlmLensRequest; configId: string }) => {
            const response = await getVlmLens(request);
            await setChartData(request.chartId, response, "vlm-lens");
            return response;
        },
        onError: (_error, _variables, context) => {
            if (context?.previousChart) {
                queryClient.setQueryData(context.chartKey, context.previousChart);
            }
            toast.error("Failed to compute VLM logit lens visualization");
        },
        onSuccess: async (_data, variables) => {
            const chartKey = queryKeys.charts.chart(variables.request.chartId);
            await queryClient.invalidateQueries({ queryKey: chartKey });
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
