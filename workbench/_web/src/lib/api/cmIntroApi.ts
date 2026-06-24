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
import { createLensRun, updateLensRunIntervention } from "@/lib/queries/lensRunQueries";
import { extractLastRow } from "@/lib/lens-last-row";
import { queryKeys } from "../queryKeys";
import { toast } from "sonner";
import type { LogitLensIntroData } from "@/types/logitLensIntro";
import type { CMIntroChartData, CMIntroInterventionSpec } from "@/types/cmIntro";
import type { LensRunSummary, LensRunHeatmaps, LensRunPromptSummary } from "@/types/lensRun";

/**
 * Distil a full lens result into a prompt's COMPACT history summary: the
 * prompt, its final-layer prediction, and the per-layer last-row strip (what
 * the rail renders). NO heatmap — that lives in the run's `data` column,
 * fetched on demand. Null when the lens is empty/malformed so callers can skip
 * recording it.
 */
const toPromptSummary = (prompt: string, data: LogitLensIntroData): LensRunPromptSummary | null => {
    const lastRow = extractLastRow(data);
    if (!lastRow) return null;
    return {
        prompt,
        finalToken: lastRow.cells.at(-1)?.token ?? null,
        lastRow,
    };
};

export interface CMIntroLensRequest {
    sourcePrompt: string;
    targetPrompt: string;
    model: string;
    chartId: string;
    // Sourced from the route, not re-fetched from the chart row. Lets the
    // prompt-history write stand on its own even if the chart row is briefly
    // missing (e.g. a preview pod whose ephemeral DB was just reset), instead
    // of silently skipping.
    workspaceId: string;
    topk?: number;
    includeEntropy?: boolean;
}

export interface CMIntroLensResult {
    source: LogitLensIntroData;
    // Optional: when the user runs CM Intro in single-prompt mode (target blank)
    // we only compute the source lens.
    target: LogitLensIntroData | null;
    // Superset fields populated by the run mutation (undefined on the ephemeral
    // restore path). Consumers that only need the heatmaps treat this as
    // { source, target }; onSuccess uses these to seed the heatmap cache.
    activeLensRunId?: string;
    summary?: LensRunSummary;
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

// Default top-k captured per cell. Raised from 5 so tokens of interest
// (e.g. answer choices A/B/C/D) are more likely to land in the visible set —
// the grid renders up to 15 candidates in its prediction panel.
const CM_INTRO_DEFAULT_TOPK = 10;

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

// Bare async executor, exported alongside the hook so a feature can run the
// CM-intro lens pair without the hook's toast/invalidation wiring (per the
// repo convention; see generateCompletion in modelsApi.ts).
export const runCMIntroLogitLens = async (
    request: CMIntroLensRequest,
): Promise<CMIntroLensResult> => {
    const headers = await createUserHeadersAction();
    const topk = request.topk ?? CM_INTRO_DEFAULT_TOPK;
    const includeEntropy = request.includeEntropy ?? true;
    const hasTarget = !!request.targetPrompt && request.targetPrompt.trim().length > 0;

    const [source, target] = await Promise.all([
        runLogitLens(request.sourcePrompt, request.model, topk, includeEntropy, headers),
        hasTarget
            ? runLogitLens(request.targetPrompt, request.model, topk, includeEntropy, headers)
            : Promise.resolve(null as unknown as LogitLensIntroData | null),
    ]);

    // F1: record this run as ONE prompt-history entry (source + optional
    // target). The compact `summary` feeds the rail; the full `heatmaps`
    // live in the row's `data` column and are fetched on demand (restore
    // / compare). Capture the id so the chart row knows which entry to
    // attach a later patch to. Best-effort — a history-write failure must
    // not fail an otherwise-successful run, so activeLensRunId may stay
    // undefined.
    let activeLensRunId: string | undefined;
    const srcSummary = toPromptSummary(request.sourcePrompt, source);
    const tgtSummary = target && hasTarget ? toPromptSummary(request.targetPrompt, target) : null;
    // Only build a summary when the source lens is well-formed. Casting a
    // null srcSummary to LensRunPromptSummary would put a null `source`
    // into a non-nullable field, crashing any consumer that reads
    // summary.source.lastRow.
    const summary: LensRunSummary | undefined = srcSummary
        ? {
              source: srcSummary,
              ...(tgtSummary ? { target: tgtSummary } : {}),
              params: { topk, includeEntropy },
          }
        : undefined;
    try {
        if (request.workspaceId && summary) {
            const heatmaps: LensRunHeatmaps = {
                source,
                ...(target ? { target } : {}),
            };
            const created = await createLensRun({
                workspaceId: request.workspaceId,
                chartId: request.chartId,
                model: request.model,
                summary,
                heatmaps,
            });
            activeLensRunId = created.id;
        }
    } catch (err) {
        console.error("Failed to record prompt history", err);
    }

    // The chart row carries NO heatmaps anymore — just the prompts, the
    // snapshot of the prompts this run was computed from, and a pointer
    // to the run that owns the heatmaps (activeLensRunId). The Display
    // fetches the heatmaps by that id. lastRunSourcePrompt/
    // lastRunTargetPrompt snapshot the prompts actually run, so the
    // predicted-next-token hint and the stale-prompt placeholder can fire
    // on edits even though autosave keeps sourcePrompt/targetPrompt fresh.
    const persisted: CMIntroChartData = {
        sourcePrompt: request.sourcePrompt,
        targetPrompt: request.targetPrompt,
        lastRunSourcePrompt: request.sourcePrompt,
        lastRunTargetPrompt: request.targetPrompt,
        ...(activeLensRunId ? { activeLensRunId } : {}),
    };
    await setChartData(request.chartId, persisted, "cm-intro");

    // Superset of CMIntroLensResult: CMIntroArea consumes { source,
    // target } (extra fields ignored); onSuccess uses activeLensRunId +
    // summary to seed the heatmap cache for an instant restore.
    return { source, target, activeLensRunId, summary };
};

export const useCMIntroLogitLens = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: ["cmIntroLogitLens"],
        mutationFn: runCMIntroLogitLens,
        onError: () => {
            toast.error("Failed to run logit lens.");
        },
        onSuccess: async (data, variables) => {
            // Independent invalidations — run concurrently.
            await Promise.all([
                queryClient.invalidateQueries({
                    queryKey: queryKeys.charts.chart(variables.chartId),
                }),
                // Refresh the prompt-history rail (all models for this chart).
                queryClient.invalidateQueries({
                    queryKey: queryKeys.lensRuns.byChart(variables.chartId),
                }),
            ]);
            // Seed the heatmap cache for the just-created run so restoring this
            // entry (or revisiting after the chart-row invalidation) is a cache
            // hit rather than a fresh round-trip. activeLensRunId and summary are
            // set together (both come from the same successful createLensRun).
            if (data.activeLensRunId && data.summary) {
                queryClient.setQueryData(queryKeys.lensRuns.heatmaps([data.activeLensRunId]), [
                    {
                        id: data.activeLensRunId,
                        summary: data.summary,
                        data: {
                            source: data.source,
                            ...(data.target ? { target: data.target } : {}),
                        },
                    },
                ]);
            }
        },
    });
};

export const useCMIntroIntervention = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: ["cmIntroIntervention"],
        mutationFn: async (request: CMIntroInterventionRequest): Promise<LogitLensIntroData> => {
            const headers = await createUserHeadersAction();
            const topk = request.topk ?? CM_INTRO_DEFAULT_TOPK;
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

            // Merge onto existing chart data so we preserve the prompts and the
            // active-run pointer. The patched heatmap is NOT written to the chart
            // row — it's attached to the active run below and fetched on demand.
            const existingChart = await getChartById(request.chartId);
            const existingData = (existingChart?.data ?? {}) as Partial<CMIntroChartData>;
            const merged: CMIntroChartData = {
                ...existingData,
                sourcePrompt: existingData.sourcePrompt ?? request.srcPrompt,
                targetPrompt: existingData.targetPrompt ?? request.tgtPrompt,
                intervention: request.intervention,
            };
            await setChartData(request.chartId, merged, "cm-intro");

            // F1: attach the patch + its heatmap to the run entry that produced
            // the current state, so the history shows the patch and the compare
            // overlay can render the patched pass. Best-effort.
            const runId = existingData.activeLensRunId;
            try {
                if (runId) {
                    const interventionSummary = toPromptSummary(request.tgtPrompt, result);
                    if (interventionSummary) {
                        await updateLensRunIntervention(
                            runId,
                            request.intervention,
                            interventionSummary,
                            result,
                        );
                        // Invalidate every cached heatmap query that includes
                        // this run so a revisit / compare shows the patched pass
                        // rather than a stale (pre-patch) entry. A plain
                        // invalidate on heatmaps([runId]) only prefix-matches the
                        // single-id key; the compare overlay batches ids into
                        // ["lensRunHeatmaps", ...sortedIds] and would be missed
                        // unless runId happened to sort first. Done here (not
                        // onSuccess) because runId is only known inside the
                        // mutation.
                        await queryClient.invalidateQueries({
                            predicate: (q) =>
                                q.queryKey[0] === "lensRunHeatmaps" &&
                                (q.queryKey as unknown[]).includes(runId),
                        });
                    }
                }
            } catch (err) {
                console.error("Failed to attach patch to prompt history", err);
            }

            // The explorer's handleIntervention transforms this and renders it as
            // the patched pass; return it unchanged.
            return result;
        },
        onError: () => {
            toast.error("Failed to run causal mediation intervention.");
        },
        onSuccess: async (_data, variables) => {
            // Independent invalidations — run concurrently.
            await Promise.all([
                queryClient.invalidateQueries({
                    queryKey: queryKeys.charts.chart(variables.chartId),
                }),
                // Refresh the prompt-history rail so the new patch badge appears.
                queryClient.invalidateQueries({
                    queryKey: queryKeys.lensRuns.byChart(variables.chartId),
                }),
            ]);
        },
    });
};
