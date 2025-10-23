"use server";

import { db } from "@/db/client";
import { workspaces, charts, documents } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

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
      chartCount: sql<number>`cast(count(distinct ${charts.id}) as integer)`,
      documentCount: sql<number>`cast(count(distinct ${documents.id}) as integer)`,
    })
    .from(workspaces)
    .leftJoin(charts, eq(workspaces.id, charts.workspaceId))
    .leftJoin(documents, eq(workspaces.id, documents.workspaceId))
    .where(eq(workspaces.userId, userId))
    .groupBy(workspaces.id);

  return workspaceList;
};

export const deleteWorkspace = async (userId: string, workspaceId: string) => {
  await db
    .delete(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)));
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
