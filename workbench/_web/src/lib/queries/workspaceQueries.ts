"use server";

import type { Workspace } from "@/db/schema";
import { requireUserId } from "@/lib/auth/user";
import * as workspaceDb from "@/lib/queries/workspaceDb";
import type { WorkspaceItemKind, WorkspaceLibrary } from "@/types/workspaces";

/**
 * The workspace RPC surface. Every export is a public endpoint, so each one
 * resolves the signed-in user itself and acts only on that user's
 * workspaces; the unguarded internals live in workspaceDb.ts.
 */

/** The signed-in user's workspaces and their charts and reports, for the global sidebar. */
export async function getWorkspaceLibrary(): Promise<WorkspaceLibrary> {
    return workspaceDb.getWorkspaceLibrary(await requireUserId());
}

/** The signed-in user's workspaces (folders) with item counts, for workspace pickers. */
export async function getUserWorkspaces() {
    return workspaceDb.getWorkspaces(await requireUserId());
}

/** One of the signed-in user's workspaces, or null when it isn't theirs. */
export async function getUserWorkspace(workspaceId: string): Promise<Workspace | null> {
    const [userId, workspace] = await Promise.all([
        requireUserId(),
        workspaceDb.getWorkspaceById(workspaceId),
    ]);
    return workspace && workspace.userId === userId ? workspace : null;
}

/** Creates a workspace (folder) for the signed-in user. */
export async function createUserWorkspace(name: string): Promise<Workspace> {
    return workspaceDb.createWorkspace(await requireUserId(), name);
}

/** Renames one of the signed-in user's workspaces (never the default one). */
export async function renameUserWorkspace(workspaceId: string, name: string): Promise<Workspace> {
    return workspaceDb.renameWorkspace(await requireUserId(), workspaceId, name);
}

/** Deletes one of the signed-in user's workspaces and its contents (never the default one). */
export async function deleteUserWorkspace(workspaceId: string): Promise<void> {
    return workspaceDb.deleteWorkspace(await requireUserId(), workspaceId);
}

/** Saves the order of the charts and reports in one of the signed-in user's workspaces. */
export async function reorderWorkspaceItems(
    workspaceId: string,
    items: { kind: WorkspaceItemKind; id: string }[],
): Promise<void> {
    return workspaceDb.reorderWorkspaceItems(await requireUserId(), workspaceId, items);
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
