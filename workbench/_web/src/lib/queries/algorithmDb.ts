import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db/client";
import { algorithms, workspaces, type AlgorithmRow } from "@/db/schema";
import { touchWorkspace } from "@/lib/queries/workspaceDb";
import type { AlgorithmDefinition } from "@/types/algorithmHypothesis";

/**
 * Unguarded algorithm DB internals. The "use server" RPC surface lives in
 * algorithmQueries.ts, which resolves the signed-in user before calling these.
 * Writes keyed by an algorithm id take the user and touch only algorithms in
 * that user's workspaces.
 */

export interface AlgorithmListItem {
    id: string;
    name: string;
    updatedAt: Date;
    savedAt: Date | null;
}

/** The algorithm `id`, as a filter that matches only when it is in one of the user's workspaces. */
const isUserAlgorithm = (userId: string, id: string) =>
    and(
        eq(algorithms.id, id),
        inArray(
            algorithms.workspaceId,
            db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.userId, userId)),
        ),
    );

export const insertAlgorithm = async (
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

export const getUserAlgorithm = async (
    userId: string,
    id: string,
): Promise<AlgorithmRow | null> => {
    const [row] = await db.select().from(algorithms).where(isUserAlgorithm(userId, id));
    return (row ?? null) as AlgorithmRow | null;
};

export const listAlgorithms = async (workspaceId: string): Promise<AlgorithmListItem[]> => {
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
export const listSavedAlgorithms = async (
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
export const saveVersion = async (
    userId: string,
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
        .where(isUserAlgorithm(userId, id))
        .returning();
    if (row) await touchWorkspace(row.workspaceId);
    return (row ?? null) as AlgorithmRow | null;
};

/** Replace the definition. The `name` column follows definition.name. */
export const writeDefinition = async (
    userId: string,
    id: string,
    definition: AlgorithmDefinition,
): Promise<AlgorithmRow | null> => {
    const [row] = await db
        .update(algorithms)
        .set({ name: definition.name, definition })
        .where(isUserAlgorithm(userId, id))
        .returning();
    if (row) await touchWorkspace(row.workspaceId);
    return (row ?? null) as AlgorithmRow | null;
};

/** A copy in the same workspace, as a draft (copied charts, "Duplicate"). The
 * caller has checked that the algorithm is the user's. */
export const copyAlgorithm = async (id: string): Promise<AlgorithmRow | null> => {
    const [original] = await db.select().from(algorithms).where(eq(algorithms.id, id));
    if (!original) return null;
    const definition = original.definition as AlgorithmDefinition;
    return insertAlgorithm(original.workspaceId, {
        ...definition,
        name: `Copy of ${definition.name}`,
    });
};
