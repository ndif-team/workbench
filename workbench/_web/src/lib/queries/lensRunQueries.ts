"use server";

import { requireUserId } from "@/lib/auth/user";
import * as lensRunDb from "@/lib/queries/lensRunDb";
import type {
    CreateLensRunInput,
    LensRunHeatmapsRow,
    LensRunListItem,
} from "@/lib/queries/lensRunDb";
import type { LensRunPromptSummary } from "@/types/lensRun";
import type { PatchLensInterventionSpec } from "@/types/patchLens";
import type { LogitLensIntroData } from "@/types/logitLensIntro";

/**
 * The lens-run (Patch Lens prompt history) RPC surface. Every export is a
 * public endpoint, so each one resolves the signed-in user itself and reads
 * or writes only runs on that user's charts; the unguarded internals live in
 * lensRunDb.ts.
 */

/** Records a run in the history of one of the signed-in user's charts. */
export async function createLensRun(input: CreateLensRunInput): Promise<LensRunListItem> {
    return lensRunDb.createLensRun(await requireUserId(), input);
}

/** History for one of the signed-in user's charts, oldest → newest, without heatmaps. */
export async function getLensRunsByChart(
    chartId: string,
    model?: string,
): Promise<LensRunListItem[]> {
    return lensRunDb.getLensRunsByChart(await requireUserId(), chartId, model);
}

/** Full heatmaps for a set of the signed-in user's runs. */
export async function getLensRunHeatmapsByIds(ids: string[]): Promise<LensRunHeatmapsRow[]> {
    return lensRunDb.getLensRunHeatmapsByIds(await requireUserId(), ids);
}

/** Full heatmaps for one of the signed-in user's runs. */
export async function getLensRunHeatmaps(id: string): Promise<LensRunHeatmapsRow | null> {
    return lensRunDb.getLensRunHeatmaps(await requireUserId(), id);
}

/** Deletes one of the signed-in user's runs. */
export async function deleteLensRun(id: string): Promise<void> {
    return lensRunDb.deleteLensRun(await requireUserId(), id);
}

/** Clears the history of one of the signed-in user's charts. */
export async function clearLensRunsForChart(chartId: string): Promise<void> {
    return lensRunDb.clearLensRunsForChart(await requireUserId(), chartId);
}

/** Attaches a patch and its result to one of the signed-in user's runs. */
export async function updateLensRunIntervention(
    id: string,
    intervention: PatchLensInterventionSpec,
    interventionSummary: LensRunPromptSummary,
    interventionHeatmap: LogitLensIntroData,
): Promise<void> {
    return lensRunDb.updateLensRunIntervention(
        await requireUserId(),
        id,
        intervention,
        interventionSummary,
        interventionHeatmap,
    );
}
