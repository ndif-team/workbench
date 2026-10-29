"use server";

import { db } from "@/db/client";
import { documents, Document } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { SerializedEditorState } from "lexical";
import { requireUserId } from "@/lib/auth/user";
import * as documentDb from "@/lib/queries/documentDb";
import { deriveReportTitle } from "@/lib/reportTitle";

/**
 * The report (document) RPC surface. Every export is a public endpoint:
 * writes resolve the signed-in user and act only on their reports (the
 * unguarded internals live in documentDb.ts). The reads below are keyed by a
 * report or workspace id and not owner-checked.
 */

export const getDocumentById = async (documentId: string): Promise<Document | null> => {
    const [document] = await db.select().from(documents).where(eq(documents.id, documentId));

    return document ?? null;
};

export const getDocumentByWorkspaceId = async (workspaceId: string): Promise<Document | null> => {
    const [document] = await db
        .select()
        .from(documents)
        .where(eq(documents.workspaceId, workspaceId));

    return document ?? null;
};

export type DocumentListItem = Pick<Document, "id" | "workspaceId" | "createdAt" | "updatedAt"> & {
    position: number;
    derivedTitle: string;
};

export const getDocumentsForWorkspace = async (
    workspaceId: string,
): Promise<DocumentListItem[]> => {
    const docs = await db
        .select()
        .from(documents)
        .where(eq(documents.workspaceId, workspaceId))
        .orderBy(asc(documents.position), asc(documents.createdAt));

    return docs.map((d: Document) => ({
        id: d.id,
        workspaceId: d.workspaceId,
        position: d.position,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        derivedTitle: deriveReportTitle(d.content as SerializedEditorState),
    }));
};

/** Creates a report at the end of one of the signed-in user's workspaces. */
export async function createDocument(workspaceId: string): Promise<Document> {
    return documentDb.createDocument(await requireUserId(), workspaceId);
}

/** Saves the content of one of the signed-in user's reports. */
export async function updateDocument(
    documentId: string,
    content: SerializedEditorState,
): Promise<Document> {
    return documentDb.updateDocument(await requireUserId(), documentId, content);
}

/** Deletes one of the signed-in user's reports. */
export async function deleteDocument(documentId: string): Promise<void> {
    return documentDb.deleteDocument(await requireUserId(), documentId);
}
