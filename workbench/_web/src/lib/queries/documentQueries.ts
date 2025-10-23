"use server";

import { db } from "@/db/client";
import { documents, Document } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { SerializedEditorState } from "lexical";

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
  return updated;
};

// Extract plain text from a Lexical SerializedEditorState
function extractPlainTextFromLexical(content: SerializedEditorState): string {
  try {
    const visit = (node: any, lines: string[], currentLine: string[]) => {
      if (!node) return;
      const type = node.type;
      if (type === "text" && typeof node.text === "string") {
        currentLine.push(node.text);
      }
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          visit(child, lines, currentLine);
        }
      }
      if (type === "linebreak") {
        lines.push(currentLine.join(""));
        currentLine.length = 0;
      }
      // For block-level nodes, terminate the line
      if (["paragraph", "heading", "quote", "list", "listitem", "code"].includes(type)) {
        if (currentLine.length > 0) {
          lines.push(currentLine.join(""));
          currentLine.length = 0;
        } else {
          // Ensure empty line for empty blocks
          lines.push("");
        }
      }
    };
    const lines: string[] = [];
    visit((content as any).root, lines, []);
    return lines.join("\n");
  } catch {
    return "";
  }
}

// Derive a title from the first non-empty line, stripping markdown prefixes
function deriveTitleFromContent(content: SerializedEditorState): string {
  const text = extractPlainTextFromLexical(content);
  const lines = text.split(/\r?\n/);
  let first = "";
  for (const raw of lines) {
    const stripped = raw.replace(/^\s+|\s+$/g, "");
    if (stripped.length > 0) {
      first = stripped;
      break;
    }
  }
  if (!first) return "";
  // Strip markdown markers and surrounding whitespace
  first = first.replace(/^\s*(#{1,6}\s+|>\s+|[-*+]\s+|`{3,}.*$|`+)\s*/g, "").trim();
  // Cap length to keep UI tidy
  if (first.length > 100) first = first.slice(0, 100).trimEnd() + "…";
  return first;
}

export type DocumentListItem = Pick<Document, "id" | "workspaceId" | "createdAt" | "updatedAt"> & {
  derivedTitle: string;
};

export const getDocumentsForWorkspace = async (
  workspaceId: string,
): Promise<DocumentListItem[]> => {
  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.workspaceId, workspaceId))
    .orderBy(desc(documents.createdAt));

  return docs.map((d) => ({
    id: d.id,
    workspaceId: d.workspaceId,
    createdAt: d.createdAt,
    updatedAt: (d as any).updatedAt ?? d.createdAt,
    derivedTitle: deriveTitleFromContent(d.content as SerializedEditorState),
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
      // {
      //     type: "paragraph",
      //     version: 1,
      //     format: "",
      //     indent: 0,
      //     direction: "ltr",
      //     children: [
      //         {
      //             type: "text",
      //             version: 1,
      //             text: "This is your overview.",
      //             detail: 0,
      //             format: 0,
      //             mode: "normal",
      //             style: "",
      //         },
      //     ],
      // },
      // {
      //     type: "heading",
      //     tag: "h2",
      //     version: 1,
      //     format: "",
      //     indent: 0,
      //     direction: "ltr",
      //     children: [
      //         {
      //             type: "text",
      //             version: 1,
      //             text: "Getting Started",
      //             detail: 0,
      //             format: 0,
      //             mode: "normal",
      //             style: "",
      //         },
      //     ],
      // },
      // {
      //     type: "paragraph",
      //     version: 1,
      //     format: "",
      //     indent: 0,
      //     direction: "ltr",
      //     children: [
      //         {
      //             type: "text",
      //             version: 1,
      //             text: "- Type markdown, it autoformats",
      //             detail: 0,
      //             format: 0,
      //             mode: "normal",
      //             style: "",
      //         },
      //     ],
      // },
      // {
      //     type: "paragraph",
      //     version: 1,
      //     format: "",
      //     indent: 0,
      //     direction: "ltr",
      //     children: [
      //         {
      //             type: "text",
      //             version: 1,
      //             text: "- Add charts by dragging them in from the sidebar",
      //             detail: 0,
      //             format: 0,
      //             mode: "normal",
      //             style: "",
      //         },
      //     ],
      // },
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

  const [document] = await db
    .insert(documents)
    .values({
      workspaceId,
      content: initialContent,
    })
    .returning();

  return document;
};

export const deleteDocument = async (documentId: string): Promise<void> => {
  await db.delete(documents).where(eq(documents.id, documentId));
};
