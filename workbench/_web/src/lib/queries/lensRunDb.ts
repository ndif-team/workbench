import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { charts, lensRuns, workspaces, type LensRun } from "@/db/schema";
import type { LensRunSummary, LensRunHeatmaps, LensRunPromptSummary } from "@/types/lensRun";
import type { PatchLensInterventionSpec } from "@/types/patchLens";
import type { LogitLensIntroData } from "@/types/logitLensIntro";

/**
 * Unguarded lens-run (Patch Lens prompt history) DB internals. The "use
 * server" RPC surface lives in lensRunQueries.ts, which resolves the
 * signed-in user before calling these. A run belongs to its chart, so each
 * takes the user and reads or writes only runs on charts in that user's
 * workspaces.
 *
 * One row per successful patch-lens lens run, scoped by (chart, model), with
 * the payload in json columns. Split storage: `summary` is the compact slice
 * the rail lists; `data` holds the full per-prompt heatmaps. List/scope
 * queries NEVER select `data` — the heatmaps are fetched on demand by id via
 * `getLensRunHeatmaps[ByIds]`.
 */

/** A lens_runs row without the heavy `data` heatmaps — the list/rail payload. */
export type LensRunListItem = Omit<LensRun, "data">;

/** A run's full heatmaps, with its summary so a caller can pair strips with them. */
export type LensRunHeatmapsRow = { id: string; summary: LensRunSummary; data: LensRunHeatmaps };

/** How many runs to keep per chart; older runs are pruned after each insert. */
const RETENTION_CAP = 50;

export interface CreateLensRunInput {
    chartId: string;
    model: string;
    summary: LensRunSummary;
    heatmaps: LensRunHeatmaps;
}

const listColumns = {
    id: lensRuns.id,
    workspaceId: lensRuns.workspaceId,
    chartId: lensRuns.chartId,
    model: lensRuns.model,
    summary: lensRuns.summary,
    createdAt: lensRuns.createdAt,
};

/** The ids of the charts in the user's workspaces, as a subquery. */
const userChartIds = (userId: string) =>
    db
        .select({ id: charts.id })
        .from(charts)
        .innerJoin(workspaces, eq(charts.workspaceId, workspaces.id))
        .where(eq(workspaces.userId, userId));

/** Runs on the user's charts, as a filter. */
const isUserRun = (userId: string) => inArray(lensRuns.chartId, userChartIds(userId));

const chartNotFound = () => new Error("Chart not found or access denied");

const runNotFound = () => new Error("Lens run not found or access denied");

/** The workspace of the user's chart `chartId`; throws when the chart isn't theirs. */
const userChartWorkspace = async (userId: string, chartId: string): Promise<string> => {
    const [chart] = await db
        .select({ workspaceId: charts.workspaceId })
        .from(charts)
        .innerJoin(workspaces, eq(charts.workspaceId, workspaces.id))
        .where(and(eq(charts.id, chartId), eq(workspaces.userId, userId)))
        .limit(1);
    if (!chart) throw chartNotFound();
    return chart.workspaceId;
};

/**
 * Records a run in the history of one of the user's charts. The run is filed
 * under the chart's current workspace, so a page whose workspace scope
 * predates a move can't file it under the old one (and lose it when that
 * workspace is deleted).
 */
export const createLensRun = async (
    userId: string,
    input: CreateLensRunInput,
): Promise<LensRunListItem> => {
    const workspaceId = await userChartWorkspace(userId, input.chartId);
    const [row] = await db
        .insert(lensRuns)
        .values({
            workspaceId,
            chartId: input.chartId,
            model: input.model,
            summary: input.summary,
            data: input.heatmaps,
        })
        .returning(listColumns);
    await pruneLensRuns(input.chartId);
    return row as LensRunListItem;
};

/**
 * Trim a chart's history to the most recent RETENTION_CAP runs. Plain sequential
 * statements, no transaction: the sqlite drivers take sync tx callbacks while
 * postgres-js is async, so an async tx callback breaks atomicity under
 * bun:sqlite (same reason createChartConfigPair avoids transactions). A trim
 * doesn't need atomicity anyway.
 */
const pruneLensRuns = async (chartId: string): Promise<void> => {
    const ids = await db
        .select({ id: lensRuns.id })
        .from(lensRuns)
        .where(eq(lensRuns.chartId, chartId))
        .orderBy(asc(lensRuns.createdAt), asc(lensRuns.id));
    if (ids.length <= RETENTION_CAP) return;
    const doomed = ids.slice(0, ids.length - RETENTION_CAP).map((r: { id: string }) => r.id);
    await db.delete(lensRuns).where(inArray(lensRuns.id, doomed));
};

/**
 * History for one of the user's charts, oldest → newest (so the rail can
 * stack with the most recent at the bottom/highlighted); empty for anyone
 * else's chart. Optionally filter by model, since strips only align
 * layer-for-layer within one model. Never selects `data`; the id tiebreaker
 * keeps same-second runs in insertion order.
 */
export const getLensRunsByChart = async (
    userId: string,
    chartId: string,
    model?: string,
): Promise<LensRunListItem[]> => {
    const conds = [eq(lensRuns.chartId, chartId), isUserRun(userId)];
    if (model) conds.push(eq(lensRuns.model, model));
    const rows = await db
        .select(listColumns)
        .from(lensRuns)
        .where(and(...conds))
        .orderBy(asc(lensRuns.createdAt), asc(lensRuns.id));
    return rows as LensRunListItem[];
};

/**
 * Full heatmaps for a set of the user's runs, fetched on demand (restore /
 * compare); ids of anyone else's runs are left out. Keyed by id so the
 * compare overlay can batch the two prompts it's diffing in one round-trip.
 */
export const getLensRunHeatmapsByIds = async (
    userId: string,
    ids: string[],
): Promise<LensRunHeatmapsRow[]> => {
    if (!ids.length) return [];
    const rows = await db
        .select({ id: lensRuns.id, summary: lensRuns.summary, data: lensRuns.data })
        .from(lensRuns)
        .where(and(inArray(lensRuns.id, ids), isUserRun(userId)));
    return rows as LensRunHeatmapsRow[];
};

/** Full heatmaps for one of the user's runs (thin wrapper over the batched fetch). */
export const getLensRunHeatmaps = async (
    userId: string,
    id: string,
): Promise<LensRunHeatmapsRow | null> => {
    return (await getLensRunHeatmapsByIds(userId, [id]))[0] ?? null;
};

/** Deletes one of the user's runs. */
export const deleteLensRun = async (userId: string, id: string): Promise<void> => {
    const deleted = await db
        .delete(lensRuns)
        .where(and(eq(lensRuns.id, id), isUserRun(userId)))
        .returning({ id: lensRuns.id });
    if (deleted.length === 0) throw runNotFound();
};

/** Clears the history of one of the user's charts (the rail's "Clear" affordance). */
export const clearLensRunsForChart = async (userId: string, chartId: string): Promise<void> => {
    await userChartWorkspace(userId, chartId);
    await db.delete(lensRuns).where(and(eq(lensRuns.chartId, chartId), isUserRun(userId)));
};

/**
 * Attach a patch to one of the user's runs. Called after a causal-mediation
 * intervention completes so the run that produced the current state records the
 * intervention spec + its patched strip (`summary`) and heatmap (`data`).
 * Read-modify-write merge so source/target are preserved; portable across both
 * dialects (no jsonb update fork).
 */
export const updateLensRunIntervention = async (
    userId: string,
    id: string,
    intervention: PatchLensInterventionSpec,
    interventionSummary: LensRunPromptSummary,
    interventionHeatmap: LogitLensIntroData,
): Promise<void> => {
    const isRun = and(eq(lensRuns.id, id), isUserRun(userId));
    const [existing] = await db
        .select({ summary: lensRuns.summary, data: lensRuns.data })
        .from(lensRuns)
        .where(isRun);
    if (!existing) throw runNotFound();
    const summary: LensRunSummary = {
        ...(existing.summary as LensRunSummary),
        intervention,
        interventionResult: interventionSummary,
    };
    const data: LensRunHeatmaps = {
        ...(existing.data as LensRunHeatmaps),
        interventionResult: interventionHeatmap,
    };
    const updated = await db
        .update(lensRuns)
        .set({ summary, data })
        .where(isRun)
        .returning({ id: lensRuns.id });
    if (updated.length === 0) throw runNotFound();
};
