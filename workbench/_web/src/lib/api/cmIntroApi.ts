/**
 * CM Intro API — reuses the /logit_lens backend to compute logit lens
 * results for a source and target prompt pair, plus /causal_mediation
 * for the cell-drop intervention.
 */

import config from "@/lib/config";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { startAndPoll } from "../startAndPoll";
import { createUserHeadersAction } from "@/actions/auth";
import { setChartData, getChartById } from "@/lib/queries/chartQueries";
import { queryKeys } from "../queryKeys";
import { toast } from "sonner";
import type { LogitLensIntroData } from "@/types/logitLensIntro";
import type { CMIntroChartData, CMIntroInterventionSpec } from "@/types/cmIntro";

export interface CMIntroLensRequest {
    sourcePrompt: string;
    targetPrompt: string;
    model: string;
    chartId: string;
    topk?: number;
    includeEntropy?: boolean;
}

export interface CMIntroLensResult {
    source: LogitLensIntroData;
    target: LogitLensIntroData;
}

export interface CMIntroInterventionRequest {
    model: string;
    srcPrompt: string;
    tgtPrompt: string;
    intervention: CMIntroInterventionSpec;
    chartId: string;
    topk?: number;
    includeEntropy?: boolean;
}

const runLogitLens = async (
    prompt: string,
    model: string,
    topk: number,
    includeEntropy: boolean,
    headers: Record<string, string>,
): Promise<LogitLensIntroData> => {
    return await startAndPoll<LogitLensIntroData>(
        config.endpoints.startLens2,
        {
            model,
            prompt,
            topk,
            include_entropy: includeEntropy,
        },
        config.endpoints.resultsLens2,
        headers,
    );
};

export const useCMIntroLogitLens = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: ["cmIntroLogitLens"],
        mutationFn: async (request: CMIntroLensRequest): Promise<CMIntroLensResult> => {
            const headers = await createUserHeadersAction();
            const topk = request.topk ?? 5;
            const includeEntropy = request.includeEntropy ?? true;

            const [source, target] = await Promise.all([
                runLogitLens(request.sourcePrompt, request.model, topk, includeEntropy, headers),
                runLogitLens(request.targetPrompt, request.model, topk, includeEntropy, headers),
            ]);

            // Running the base lens invalidates any prior intervention/result,
            // so we persist only the fresh { source, target } pair (alongside
            // the prompts they were computed from, so revisits restore the UI).
            // lastRunSourcePrompt/lastRunTargetPrompt snapshot the prompts that
            // were actually run, so the predicted-next-token hint can hide on
            // edits even though autosave keeps sourcePrompt/targetPrompt fresh.
            const persisted: CMIntroChartData = {
                sourcePrompt: request.sourcePrompt,
                targetPrompt: request.targetPrompt,
                lastRunSourcePrompt: request.sourcePrompt,
                lastRunTargetPrompt: request.targetPrompt,
                source,
                target,
            };
            await setChartData(request.chartId, persisted, "cm-intro");

            return { source, target };
        },
        onError: () => {
            toast.error("Failed to run logit lens.");
        },
        onSuccess: async (_data, variables) => {
            const chartKey = queryKeys.charts.chart(variables.chartId);
            await queryClient.invalidateQueries({ queryKey: chartKey });
        },
    });
};

export const useCMIntroIntervention = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: ["cmIntroIntervention"],
        mutationFn: async (request: CMIntroInterventionRequest): Promise<LogitLensIntroData> => {
            const headers = await createUserHeadersAction();
            const topk = request.topk ?? 5;
            const includeEntropy = request.includeEntropy ?? true;

            const body = {
                model: request.model,
                src_prompt: request.srcPrompt,
                tgt_prompt: request.tgtPrompt,
                src_token_pos: request.intervention.srcTokenPos,
                src_layer: request.intervention.srcLayer,
                tgt_token_pos: request.intervention.tgtTokenPos,
                tgt_layer: request.intervention.tgtLayer,
                topk,
                include_entropy: includeEntropy,
            };

            const result = await startAndPoll<LogitLensIntroData>(
                config.endpoints.startCausalMediation,
                body,
                config.endpoints.resultsCausalMediation,
                headers,
            );

            // Merge onto existing chart data so we preserve source/target and
            // the prompts they were computed from.
            const existingChart = await getChartById(request.chartId);
            const existingData = (existingChart?.data ?? {}) as Partial<CMIntroChartData>;
            const merged: CMIntroChartData = {
                ...existingData,
                sourcePrompt: existingData.sourcePrompt ?? request.srcPrompt,
                targetPrompt: existingData.targetPrompt ?? request.tgtPrompt,
                intervention: request.intervention,
                result,
            };
            await setChartData(request.chartId, merged, "cm-intro");

            return result;
        },
        onError: () => {
            toast.error("Failed to run causal mediation intervention.");
        },
        onSuccess: async (_data, variables) => {
            const chartKey = queryKeys.charts.chart(variables.chartId);
            await queryClient.invalidateQueries({ queryKey: chartKey });
        },
    });
};
