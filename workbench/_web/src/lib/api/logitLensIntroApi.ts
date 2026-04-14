/**
 * Logit Lens Intro API — reuses the same /logit_lens backend endpoints as lens2
 */

import config from "@/lib/config";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setChartData } from "@/lib/queries/chartQueries";
import { LogitLensIntroConfigData, LogitLensIntroData } from "@/types/logitLensIntro";
import { queryKeys } from "../queryKeys";
import { toast } from "sonner";
import { startAndPoll } from "../startAndPoll";
import { createUserHeadersAction } from "@/actions/auth";

interface LogitLensIntroRequest {
    completion: LogitLensIntroConfigData;
    chartId: string;
}

const getLogitLensIntro = async (lensRequest: LogitLensIntroRequest): Promise<LogitLensIntroData> => {
    const headers = await createUserHeadersAction();

    const request = {
        model: lensRequest.completion.model,
        prompt: lensRequest.completion.prompt,
        topk: lensRequest.completion.topk ?? 5,
        include_entropy: lensRequest.completion.includeEntropy ?? true,
    };

    return await startAndPoll<LogitLensIntroData>(
        config.endpoints.startLens2,
        request,
        config.endpoints.resultsLens2,
        headers,
    );
};

export const useLogitLensIntro = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: ["logitLensIntro"],
        onMutate: async ({
            lensRequest,
        }: {
            lensRequest: LogitLensIntroRequest;
            configId: string;
        }) => {
            const chartKey = queryKeys.charts.chart(lensRequest.chartId);
            await queryClient.cancelQueries({ queryKey: chartKey });
            const previousChart = queryClient.getQueryData(chartKey);
            queryClient.setQueryData(chartKey, (old: unknown) => {
                if (!old) return old;
                return { ...(old as object), type: "logit-lens-intro" };
            });
            return { previousChart, chartKey } as {
                previousChart: unknown;
                chartKey: ReturnType<typeof queryKeys.charts.chart>;
            };
        },
        mutationFn: async ({
            lensRequest,
        }: {
            lensRequest: LogitLensIntroRequest;
            configId: string;
        }) => {
            const response = await getLogitLensIntro(lensRequest);
            await setChartData(lensRequest.chartId, response, "logit-lens-intro");
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
                    queryKey: ["chartsForSidebar", chart.workspaceId],
                });
                queryClient.invalidateQueries({
                    queryKey: queryKeys.charts.configByChart(variables.lensRequest.chartId),
                });
            }
        },
    });
};
