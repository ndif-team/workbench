/**
 * F1 prompt-history normalization.
 *
 * `lens_runs.summary` is the compact slice the rail lists. `normalizeLensRun`
 * lifts that slice onto the row's identity columns so every consumer (rail,
 * restore, compare overlay) sees one flat `NormalizedRun` shape. Full heatmaps
 * live in `lens_runs.data` and are fetched separately by run id.
 *
 * This feature branch is unmerged, so no older row shapes exist — there is no
 * legacy branch to fold.
 */

import type { LensRunListItem } from "@/lib/queries/lensRunQueries";
import type { LensRunParams, LensRunPromptSummary } from "@/types/lensRun";
import type { CMIntroInterventionSpec } from "@/types/cmIntro";

export interface NormalizedRun {
    id: string;
    chartId: string;
    model: string;
    createdAt: Date;
    source: LensRunPromptSummary;
    target?: LensRunPromptSummary;
    intervention?: CMIntroInterventionSpec;
    interventionResult?: LensRunPromptSummary;
    params: LensRunParams;
}

export function normalizeLensRun(row: LensRunListItem): NormalizedRun {
    return {
        id: row.id,
        chartId: row.chartId,
        model: row.model,
        createdAt: row.createdAt,
        source: row.summary.source,
        target: row.summary.target,
        intervention: row.summary.intervention,
        interventionResult: row.summary.interventionResult,
        params: row.summary.params,
    };
}

/** A run's prompt results as a flat list — what the compare overlay selects over. */
export interface PromptResultRef {
    runId: string;
    model: string;
    role: "source" | "target" | "patched";
    result: LensRunPromptSummary;
    intervention?: CMIntroInterventionSpec;
}

export function promptResultsOf(run: NormalizedRun): PromptResultRef[] {
    const refs: PromptResultRef[] = [
        { runId: run.id, model: run.model, role: "source", result: run.source },
    ];
    if (run.target) {
        refs.push({ runId: run.id, model: run.model, role: "target", result: run.target });
    }
    if (run.interventionResult) {
        refs.push({
            runId: run.id,
            model: run.model,
            role: "patched",
            result: run.interventionResult,
            intervention: run.intervention,
        });
    }
    return refs;
}
