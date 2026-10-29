"use server";

import { db } from "@/db/client";
import { workspaces, charts, documents } from "@/db/schema";
import type { Workspace } from "@/db/schema";
import { eq, and, sql, desc, isNull } from "drizzle-orm";
import type { ProlificParams } from "@/lib/prolific";
import { requireUserId } from "@/lib/auth/user";
import * as workspaceDb from "@/lib/queries/workspaceDb";
import type { WorkspaceLibrary } from "@/types/workspaces";

export async function getWorkspaceById(workspaceId: string) {
    const [workspace] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);

    return workspace || null;
}

export async function updateWorkspace(
    workspaceId: string,
    updates: { name?: string; public?: boolean },
    userId: string,
) {
    const [updatedWorkspace] = await db
        .update(workspaces)
        .set(updates)
        .where(
            and(
                eq(workspaces.id, workspaceId),
                eq(workspaces.userId, userId),
                eq(workspaces.isDefault, false),
            ),
        )
        .returning();

    if (!updatedWorkspace) {
        throw new Error("Workspace not found or access denied");
    }

    return updatedWorkspace;
}

/** The user's workspaces (folders) with item counts. Excludes the default workspace. */
export const getWorkspaces = async (userId: string) => {
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
        .where(and(eq(workspaces.userId, userId), eq(workspaces.isDefault, false)))
        .groupBy(workspaces.id)
        .orderBy(desc(workspaces.updatedAt));

    return workspaceList;
};

/** Deletes a workspace and, by cascade, its contents. The default workspace is never deleted. */
export const deleteWorkspace = async (userId: string, workspaceId: string) => {
    await db
        .delete(workspaces)
        .where(
            and(
                eq(workspaces.id, workspaceId),
                eq(workspaces.userId, userId),
                eq(workspaces.isDefault, false),
            ),
        );
};

export type WorkspaceItemKind = "chart" | "report";

/**
 * Saves a workspace's item order: each item's position is its index.
 * Sequential rather than a transaction, since drizzle's sqlite drivers reject
 * async transaction callbacks; every write is idempotent, so a retry after a
 * partial failure converges.
 */
export const reorderWorkspaceItems = async (
    workspaceId: string,
    items: { kind: WorkspaceItemKind; id: string }[],
): Promise<void> => {
    for (let i = 0; i < items.length; i++) {
        const { kind, id } = items[i];
        if (kind === "chart") {
            await db
                .update(charts)
                .set({ position: i, updatedAt: sql`${charts.updatedAt}` })
                .where(and(eq(charts.id, id), eq(charts.workspaceId, workspaceId)));
        } else {
            await db
                .update(documents)
                .set({ position: i, updatedAt: sql`${documents.updatedAt}` })
                .where(and(eq(documents.id, id), eq(documents.workspaceId, workspaceId)));
        }
    }
};

// Wrapped versions for use with server actions/components that use withAuth
export const createWorkspace = async (
    userId: string,
    name: string,
    workshopId?: string,
    prolific?: ProlificParams | null,
) => {
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
    await db
        .update(workspaces)
        .set({ prolific })
        .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.prolific)));
};

// ---- Current-user actions (the user is resolved from the session, never passed in) ----

/** The signed-in user's workspaces and their charts and reports, for the global sidebar. */
export async function getWorkspaceLibrary(): Promise<WorkspaceLibrary> {
    return workspaceDb.getWorkspaceLibrary(await requireUserId());
}

/** Creates a workspace (folder) for the signed-in user. */
export async function createUserWorkspace(name: string): Promise<Workspace> {
    return createWorkspace(await requireUserId(), name);
}

/** Moves a chart, with its config and lens runs, to a workspace (null: the default workspace). */
export async function moveChart(chartId: string, targetWorkspaceId: string | null): Promise<void> {
    return workspaceDb.moveChart(await requireUserId(), chartId, targetWorkspaceId);
}

/** Moves a report to a workspace (null: the default workspace). */
export async function moveReport(
    documentId: string,
    targetWorkspaceId: string | null,
): Promise<void> {
    return workspaceDb.moveReport(await requireUserId(), documentId, targetWorkspaceId);
}
