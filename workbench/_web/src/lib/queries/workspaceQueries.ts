"use server";

import { db } from "@/db/client";
import { workspaces, charts, documents } from "@/db/schema";
import { eq, and, sql, desc, isNull } from "drizzle-orm";
import type { ProlificParams } from "@/lib/prolific";
import { requireUserId, requireWorkspaceOwner } from "@/lib/auth/ownership";

export async function getWorkspaceById(workspaceId: string) {
    // Scoped to the caller: the row carries user_id + prolific identifiers, so an
    // unowned id must read as "not found" rather than leak another user's data.
    const userId = await requireUserId();
    const [workspace] = await db
        .select()
        .from(workspaces)
        .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)))
        .limit(1);

    return workspace || null;
}

export async function updateWorkspace(
    workspaceId: string,
    updates: { name?: string; public?: boolean },
) {
    const userId = await requireUserId();
    const [updatedWorkspace] = await db
        .update(workspaces)
        .set(updates)
        .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)))
        .returning();

    if (!updatedWorkspace) {
        throw new Error("Workspace not found or access denied");
    }

    return updatedWorkspace;
}

export const getWorkspaces = async () => {
    const userId = await requireUserId();
    const workspaceList = await db
        .select({
            id: workspaces.id,
            userId: workspaces.userId,
            name: workspaces.name,
            public: workspaces.public,
            updatedAt: workspaces.updatedAt,
            chartCount: sql<number>`cast(count(distinct ${charts.id}) as integer)`,
            documentCount: sql<number>`cast(count(distinct ${documents.id}) as integer)`,
        })
        .from(workspaces)
        .leftJoin(charts, eq(workspaces.id, charts.workspaceId))
        .leftJoin(documents, eq(workspaces.id, documents.workspaceId))
        .where(eq(workspaces.userId, userId))
        .groupBy(workspaces.id)
        .orderBy(desc(workspaces.updatedAt));

    return workspaceList;
};

export const deleteWorkspace = async (workspaceId: string) => {
    const userId = await requireUserId();
    await db
        .delete(workspaces)
        .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)));
};

export type WorkspaceItemKind = "chart" | "report";

export const reorderWorkspaceItems = async (
    workspaceId: string,
    items: { kind: WorkspaceItemKind; id: string }[],
): Promise<void> => {
    // Both the workspace and every item are re-scoped: the workspace by owner,
    // and each update by `workspace_id` so a foreign chart/doc id can't be
    // slipped into another user's reorder batch.
    await requireWorkspaceOwner(workspaceId);
    await db.transaction(async (tx: typeof db) => {
        for (let i = 0; i < items.length; i++) {
            const { kind, id } = items[i];
            if (kind === "chart") {
                await tx
                    .update(charts)
                    .set({ position: i, updatedAt: sql`${charts.updatedAt}` })
                    .where(and(eq(charts.id, id), eq(charts.workspaceId, workspaceId)));
            } else {
                await tx
                    .update(documents)
                    .set({ position: i, updatedAt: sql`${documents.updatedAt}` })
                    .where(and(eq(documents.id, id), eq(documents.workspaceId, workspaceId)));
            }
        }
    });
};

export const createWorkspace = async (
    name: string,
    workshopId?: string,
    prolific?: ProlificParams | null,
) => {
    const userId = await requireUserId();
    const [workspace] = await db
        .insert(workspaces)
        .values({
            userId,
            name,
            workshopId: workshopId ?? null,
            prolific: prolific ?? null,
        })
        .returning();

    return workspace;
};

// Backfills Prolific identifiers onto an existing workspace, but only if none
// were captured before — first-touch wins, so a re-join carrying a fresh
// Prolific session doesn't clobber the original attribution. No-op when the
// workspace already has params.
export const setWorkspaceProlificIfEmpty = async (
    workspaceId: string,
    prolific: ProlificParams,
) => {
    await requireWorkspaceOwner(workspaceId);
    await db
        .update(workspaces)
        .set({ prolific })
        .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.prolific)));
};
