"use server";

import { db } from "@/db/client";
import { documents, Document } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { SerializedEditorState } from "lexical";
import { touchWorkspace, getNextWorkspaceItemPosition } from "@/lib/queries/workspaceDb";
import { deriveReportTitle } from "@/lib/reportTitle";

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

// Update a specific document by id
export const updateDocument = async (
    documentId: string,
    content: SerializedEditorState,
): Promise<Document> => {
    const [updated] = await db
        .update(documents)
        .set({ content })
        .where(eq(documents.id, documentId))
        .returning();
    await touchWorkspace(updated.workspaceId);
    return updated;
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

// Default content: minimal valid document (one empty paragraph)
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

export const createDocument = async (workspaceId: string): Promise<Document> => {
    const initialContent = defaultInitialContent;
    const position = await getNextWorkspaceItemPosition(workspaceId);

    const [document] = await db
        .insert(documents)
        .values({
            workspaceId,
            content: initialContent,
            position,
        })
        .returning();

    await touchWorkspace(workspaceId);
    return document;
};

export const deleteDocument = async (documentId: string): Promise<void> => {
    await db.delete(documents).where(eq(documents.id, documentId));
};
