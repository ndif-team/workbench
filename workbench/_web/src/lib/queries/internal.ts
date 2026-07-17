/**
 * Unguarded query internals — NOT a "use server" module, so these are ordinary
 * imports rather than publicly callable RPC endpoints. They're helpers the
 * guarded server actions call *after* an ownership check has already passed
 * (e.g. a create wrapper that has verified the parent workspace), so they carry
 * no guard of their own and must never be exposed to the client directly.
 *
 * Same split rationale as workshopDb.ts: keeping the trusted internals out of
 * the RPC surface means folding them into a caller doesn't re-run an ownership
 * SELECT, and it keeps the guarded/unguarded boundary explicit.
 */
import { db } from "@/db/client";
import { charts, documents, workspaces } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

/** Bump a workspace's updatedAt so recency ordering reflects child edits. */
export const touchWorkspace = async (workspaceId: string) => {
    await db
        .update(workspaces)
        .set({ updatedAt: new Date() })
        .where(eq(workspaces.id, workspaceId));
};

/** Next position at the bottom of a workspace's unified chart+document list. */
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
    const maxPos = Math.max(Number(chartRows[0]?.max ?? -1), Number(docRows[0]?.max ?? -1));
    return maxPos + 1;
};
