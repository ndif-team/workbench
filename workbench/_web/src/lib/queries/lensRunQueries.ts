"use server";

import { db } from "@/db/client";
import { lensRuns, LensRun } from "@/db/schema";
import type { LensRunSummary, LensRunHeatmaps, LensRunPromptSummary } from "@/types/lensRun";
import type { PatchLensInterventionSpec } from "@/types/patchLens";
import type { LogitLensIntroData } from "@/types/logitLensIntro";
import { and, asc, eq, inArray } from "drizzle-orm";
import { requireUserId, requireChartOwner, ownedByWorkspace } from "@/lib/auth/ownership";

/**
 * F1 prompt-history persistence. One row per successful patch-lens lens run,
 * scoped by (workspace, chart, model). Mirrors the configs/charts pattern:
 * thin server actions over `db`, payload in json columns.
 *
 * Split storage: `summary` is the compact slice the rail lists; `data` holds
 * the full per-prompt heatmaps. List/scope queries NEVER select `data` — the
 * heatmaps are fetched on demand by id via `getLensRunHeatmaps[ByIds]`.
 */

/** A lens_runs row without the heavy `data` heatmaps — the list/rail payload. */
export type LensRunListItem = Omit<LensRun, "data">;

/** How many runs to keep per chart; older runs are pruned after each insert. */
const RETENTION_CAP = 50;

export interface CreateLensRunInput {
    chartId: string;
    model: string;
    summary: LensRunSummary;
    heatmaps: LensRunHeatmaps;
}

export const createLensRun = async (input: CreateLensRunInput): Promise<LensRunListItem> => {
    // INSERT: a run belongs to a chart; the caller must own it. The verified
    // workspace is used for the row so a spoofed input.workspaceId can't detach
    // the run from its chart's real owner.
    const { workspaceId } = await requireChartOwner(input.chartId);
    const [row] = await db
        .insert(lensRuns)
        .values({
            workspaceId,
            chartId: input.chartId,
            model: input.model,
            summary: input.summary,
            data: input.heatmaps,
        })
        .returning({
            id: lensRuns.id,
            workspaceId: lensRuns.workspaceId,
            chartId: lensRuns.chartId,
            model: lensRuns.model,
            summary: lensRuns.summary,
            createdAt: lensRuns.createdAt,
        });
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
 * History for a chart, oldest → newest (so the rail can stack with the most
 * recent at the bottom/highlighted). Optionally filter by model, since strips
 * only align layer-for-layer within one model. Never selects `data`; the id
 * tiebreaker keeps same-second runs in insertion order.
 */
export const getLensRunsByChart = async (
    workspaceId: string,
    chartId: string,
    model?: string,
): Promise<LensRunListItem[]> => {
    const userId = await requireUserId();
    // Scope by owner + workspace AND chart so neither a chart id nor a workspace
    // id alone can read another user's runs.
    const conds = [
        eq(lensRuns.workspaceId, workspaceId),
        eq(lensRuns.chartId, chartId),
        ownedByWorkspace(lensRuns.workspaceId, userId),
    ];
    if (model) conds.push(eq(lensRuns.model, model));
    const where = and(...conds);
    const rows = await db
        .select({
            id: lensRuns.id,
            workspaceId: lensRuns.workspaceId,
            chartId: lensRuns.chartId,
            model: lensRuns.model,
            summary: lensRuns.summary,
            createdAt: lensRuns.createdAt,
        })
        .from(lensRuns)
        .where(where)
        .orderBy(asc(lensRuns.createdAt), asc(lensRuns.id));
    return rows as LensRunListItem[];
};

/**
 * Full heatmaps for a set of runs, fetched on demand (restore / compare). Keyed
 * by id so the compare overlay can batch the two prompts it's diffing in one
 * round-trip. Returns `{ id, summary, data }` so a caller can pair strips with
 * their heatmaps without a second list query.
 */
export const getLensRunHeatmapsByIds = async (
    ids: string[],
): Promise<{ id: string; summary: LensRunSummary; data: LensRunHeatmaps }[]> => {
    if (!ids.length) return [];
    const userId = await requireUserId();
    const rows = await db
        .select({ id: lensRuns.id, summary: lensRuns.summary, data: lensRuns.data })
        .from(lensRuns)
        .where(and(inArray(lensRuns.id, ids), ownedByWorkspace(lensRuns.workspaceId, userId)));
    return rows as { id: string; summary: LensRunSummary; data: LensRunHeatmaps }[];
};

/** Full heatmaps for a single run (thin wrapper over the batched fetch). */
export const getLensRunHeatmaps = async (
    id: string,
): Promise<{ id: string; summary: LensRunSummary; data: LensRunHeatmaps } | null> => {
    return (await getLensRunHeatmapsByIds([id]))[0] ?? null;
};

export const deleteLensRun = async (workspaceId: string, id: string): Promise<void> => {
    const userId = await requireUserId();
    // Scope by owner + workspace so a run id alone can't delete another user's row.
    await db
        .delete(lensRuns)
        .where(
            and(
                eq(lensRuns.id, id),
                eq(lensRuns.workspaceId, workspaceId),
                ownedByWorkspace(lensRuns.workspaceId, userId),
            ),
        );
};

/** Clear a chart's history (used by the rail's "Clear" affordance). Scoped by
 * workspace + chart so it can't delete another workspace's rows. */
export const clearLensRunsForChart = async (
    workspaceId: string,
    chartId: string,
): Promise<void> => {
    const userId = await requireUserId();
    await db
        .delete(lensRuns)
        .where(
            and(
                eq(lensRuns.workspaceId, workspaceId),
                eq(lensRuns.chartId, chartId),
                ownedByWorkspace(lensRuns.workspaceId, userId),
            ),
        );
};

/**
 * Attach a patch to an existing run entry. Called after a causal-mediation
 * intervention completes so the run that produced the current state records the
 * intervention spec + its patched strip (`summary`) and heatmap (`data`).
 * Read-modify-write merge so source/target are preserved; portable across both
 * dialects (no jsonb update fork).
 */
export const updateLensRunIntervention = async (
    id: string,
    intervention: PatchLensInterventionSpec,
    interventionSummary: LensRunPromptSummary,
    interventionHeatmap: LogitLensIntroData,
): Promise<void> => {
    const userId = await requireUserId();
    const [existing] = await db
        .select({ summary: lensRuns.summary, data: lensRuns.data })
        .from(lensRuns)
        .where(and(eq(lensRuns.id, id), ownedByWorkspace(lensRuns.workspaceId, userId)));
    if (!existing) return;
    const summary: LensRunSummary = {
        ...(existing.summary as LensRunSummary),
        intervention,
        interventionResult: interventionSummary,
    };
    const data: LensRunHeatmaps = {
        ...(existing.data as LensRunHeatmaps),
        interventionResult: interventionHeatmap,
    };
    await db
        .update(lensRuns)
        .set({ summary, data })
        .where(and(eq(lensRuns.id, id), ownedByWorkspace(lensRuns.workspaceId, userId)));
};
