"use server";

import { db } from "@/db/client";
import { workspaces, charts, documents } from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";

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
        .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)))
        .returning();

    if (!updatedWorkspace) {
        throw new Error("Workspace not found or access denied");
    }

    return updatedWorkspace;
}

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
        .where(eq(workspaces.userId, userId))
        .groupBy(workspaces.id)
        .orderBy(desc(workspaces.updatedAt));

    return workspaceList;
};

export const deleteWorkspace = async (userId: string, workspaceId: string) => {
    await db
        .delete(workspaces)
        .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)));
};

export const touchWorkspace = async (workspaceId: string) => {
    await db
        .update(workspaces)
        .set({ updatedAt: new Date() })
        .where(eq(workspaces.id, workspaceId));
};

export const getNextWorkspaceItemPosition = async (workspaceId: string): Promise<number> => {
    const [chartRows, docRows] = await Promise.all([
        db
            .select({ max: sql<number | null>`max(${charts.position})` })
            .from(charts)
            .where(eq(charts.workspaceId, workspaceId)),
        db
            .select({ max: sql<number | null>`max(${documents.position})` })
            .from(documents)
            .where(eq(documents.workspaceId, workspaceId)),
    ]);
    const maxPos = Math.max(
        Number(chartRows[0]?.max ?? -1),
        Number(docRows[0]?.max ?? -1),
    );
    return maxPos + 1;
};

export type WorkspaceItemKind = "chart" | "report";

export const reorderWorkspaceItems = async (
    workspaceId: string,
    items: { kind: WorkspaceItemKind; id: string }[],
): Promise<void> => {
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

// Wrapped versions for use with server actions/components that use withAuth
export const createWorkspace = async (userId: string, name: string) => {
    const [workspace] = await db
        .insert(workspaces)
        .values({
            userId,
            name,
        })
        .returning();

    return workspace;
};
