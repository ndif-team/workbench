"use server";

import { db } from "@/db/client";
import { lensRuns, LensRun } from "@/db/schema";
import type { LensRunData } from "@/types/lensRun";
import { and, asc, eq } from "drizzle-orm";

/**
 * F1 prompt-history persistence. One row per successful cm-intro lens run,
 * scoped by (workspace, chart, model). Mirrors the configs/charts pattern:
 * thin server actions over `db`, payload in a json column.
 */

export interface CreateLensRunInput {
    workspaceId: string;
    chartId: string;
    model: string;
    prompt: string;
    data: LensRunData;
}

export const createLensRun = async (input: CreateLensRunInput): Promise<LensRun> => {
    const [row] = await db
        .insert(lensRuns)
        .values({
            workspaceId: input.workspaceId,
            chartId: input.chartId,
            model: input.model,
            prompt: input.prompt,
            data: input.data,
        })
        .returning();
    return row as LensRun;
};

/**
 * History for a chart, oldest → newest (so the rail can stack with the most
 * recent at the bottom/highlighted). Optionally filter by model, since strips
 * only align layer-for-layer within one model.
 */
export const getLensRunsByChart = async (
    chartId: string,
    model?: string,
): Promise<LensRun[]> => {
    const where = model
        ? and(eq(lensRuns.chartId, chartId), eq(lensRuns.model, model))
        : eq(lensRuns.chartId, chartId);
    const rows = await db
        .select()
        .from(lensRuns)
        .where(where)
        .orderBy(asc(lensRuns.createdAt));
    return rows as LensRun[];
};

export const deleteLensRun = async (id: string): Promise<void> => {
    await db.delete(lensRuns).where(eq(lensRuns.id, id));
};

/** Clear a chart's history (used by the rail's "Clear" affordance). */
export const clearLensRunsForChart = async (chartId: string): Promise<void> => {
    await db.delete(lensRuns).where(eq(lensRuns.chartId, chartId));
};
