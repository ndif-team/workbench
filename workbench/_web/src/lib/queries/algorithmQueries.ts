"use server";

import { db } from "@/db/client";
import { algorithms, AlgorithmRow } from "@/db/schema";
import type { AlgorithmDefinition } from "@/types/algorithmHypothesis";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { touchWorkspace } from "@/lib/queries/workspaceQueries";

/**
 * Algorithm Hypothesis algorithms: workspace-scoped rows holding a schema-v4
 * definition. Charts point at one by id, so several charts can share it.
 *
 * Each row has a working copy (`definition`, autosaved on every edit) and the
 * version last saved as complete (`savedDefinition`, null for a draft). Other
 * algorithms' predictions in the intervention view come from saved versions.
 */

export interface AlgorithmListItem {
    id: string;
    name: string;
    updatedAt: Date;
    savedAt: Date | null;
}

export const createAlgorithm = async (
    workspaceId: string,
    definition: AlgorithmDefinition,
): Promise<AlgorithmRow> => {
    const [row] = await db
        .insert(algorithms)
        .values({ workspaceId, name: definition.name, definition })
        .returning();
    await touchWorkspace(workspaceId);
    return row as AlgorithmRow;
};

export const getAlgorithmById = async (id: string): Promise<AlgorithmRow | null> => {
    const [row] = await db.select().from(algorithms).where(eq(algorithms.id, id));
    return (row ?? null) as AlgorithmRow | null;
};

export const getAlgorithmsForWorkspace = async (
    workspaceId: string,
): Promise<AlgorithmListItem[]> => {
    const rows = await db
        .select({
            id: algorithms.id,
            name: algorithms.name,
            updatedAt: algorithms.updatedAt,
            savedAt: algorithms.savedAt,
        })
        .from(algorithms)
        .where(eq(algorithms.workspaceId, workspaceId))
        .orderBy(desc(algorithms.updatedAt));
    return rows as AlgorithmListItem[];
};

/** The saved version of every saved algorithm in the workspace, for running
 * the same intervention on all of them. Drafts are left out. */
export const getSavedAlgorithmsForWorkspace = async (
    workspaceId: string,
): Promise<{ id: string; definition: AlgorithmDefinition; savedAt: Date }[]> => {
    const rows = await db
        .select({
            id: algorithms.id,
            definition: algorithms.savedDefinition,
            savedAt: algorithms.savedAt,
        })
        .from(algorithms)
        .where(and(eq(algorithms.workspaceId, workspaceId), isNotNull(algorithms.savedDefinition)))
        .orderBy(desc(algorithms.savedAt));
    return rows as { id: string; definition: AlgorithmDefinition; savedAt: Date }[];
};

/** Save the algorithm as complete: the working copy becomes the saved version. */
export const saveAlgorithmVersion = async (
    id: string,
    definition: AlgorithmDefinition,
): Promise<AlgorithmRow | null> => {
    const [row] = await db
        .update(algorithms)
        .set({
            name: definition.name,
            definition,
            savedDefinition: definition,
            savedAt: new Date(),
        })
        .where(eq(algorithms.id, id))
        .returning();
    if (row) await touchWorkspace(row.workspaceId);
    return (row ?? null) as AlgorithmRow | null;
};

/** Replace the definition. The `name` column follows definition.name. */
export const updateAlgorithm = async (
    id: string,
    definition: AlgorithmDefinition,
): Promise<AlgorithmRow | null> => {
    const [row] = await db
        .update(algorithms)
        .set({ name: definition.name, definition })
        .where(eq(algorithms.id, id))
        .returning();
    if (row) await touchWorkspace(row.workspaceId);
    return (row ?? null) as AlgorithmRow | null;
};

/** A copy in the same workspace, as a draft (copied charts, "Duplicate"). */
export const duplicateAlgorithm = async (id: string): Promise<AlgorithmRow | null> => {
    const original = await getAlgorithmById(id);
    if (!original) return null;
    const definition = original.definition as AlgorithmDefinition;
    return createAlgorithm(original.workspaceId, {
        ...definition,
        name: `Copy of ${definition.name}`,
    });
};
