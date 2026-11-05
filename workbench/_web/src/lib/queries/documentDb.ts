import { and, eq, inArray } from "drizzle-orm";
import type { SerializedEditorState } from "lexical";

import { db } from "@/db/client";
import { documents, workspaces, type Document } from "@/db/schema";
import {
    getNextWorkspaceItemPosition,
    getWorkspaceById,
    touchWorkspace,
} from "@/lib/queries/workspaceDb";

/**
 * Unguarded report (document) DB internals. The "use server" RPC surface
 * lives in documentQueries.ts, which resolves the signed-in user before
 * calling these; each takes that user and touches only their reports.
 */

/** The report `documentId`, as a filter that matches only when it is in one of the user's workspaces. */
const isUserDocument = (userId: string, documentId: string) =>
    and(
        eq(documents.id, documentId),
        inArray(
            documents.workspaceId,
            db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.userId, userId)),
        ),
    );

const documentNotFound = () => new Error("Report not found or access denied");

/** A new report's content: an "Overview" heading over an empty paragraph. */
const defaultInitialContent = {
    root: {
        type: "root",
        version: 1,
        format: "",
        indent: 0,
        direction: "ltr",
        children: [
            {
                type: "heading",
                tag: "h1",
                version: 1,
                format: "",
                indent: 0,
                direction: "ltr",
                children: [
                    {
                        type: "text",
                        version: 1,
                        text: "Overview",
                        detail: 0,
                        format: 0,
                        mode: "normal",
                        style: "",
                    },
                ],
            },
            {
                type: "paragraph",
                version: 1,
                format: "",
                indent: 0,
                direction: "ltr",
            },
        ],
    },
} as unknown as SerializedEditorState;

/** Creates a report at the end of one of the user's workspaces. */
export const createDocument = async (userId: string, workspaceId: string): Promise<Document> => {
    const workspace = await getWorkspaceById(workspaceId);
    if (!workspace || workspace.userId !== userId) {
        throw new Error("Workspace not found or access denied");
    }
    const position = await getNextWorkspaceItemPosition(workspaceId);
    const [document] = await db
        .insert(documents)
        .values({ workspaceId, content: defaultInitialContent, position })
        .returning();
    await touchWorkspace(workspaceId);
    return document as Document;
};

/** Saves the content of one of the user's reports. */
export const updateDocument = async (
    userId: string,
    documentId: string,
    content: SerializedEditorState,
): Promise<Document> => {
    const [updated] = await db
        .update(documents)
        .set({ content })
        .where(isUserDocument(userId, documentId))
        .returning();
    if (!updated) throw documentNotFound();
    await touchWorkspace(updated.workspaceId);
    return updated as Document;
};

/** Deletes one of the user's reports. */
export const deleteDocument = async (userId: string, documentId: string): Promise<void> => {
    const deleted = await db
        .delete(documents)
        .where(isUserDocument(userId, documentId))
        .returning({ id: documents.id });
    if (deleted.length === 0) throw documentNotFound();
};
