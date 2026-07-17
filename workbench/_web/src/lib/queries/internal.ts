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
import { eq, sql, type SQL } from "drizzle-orm";

/** Bump a workspace's updatedAt so recency ordering reflects child edits. */
export const touchWorkspace = async (workspaceId: string) => {
    await db
        .update(workspaces)
        .set({ updatedAt: new Date() })
        .where(eq(workspaces.id, workspaceId));
};

/**
 * SQL scalar for the next position at the bottom of a workspace's unified
 * chart+document list, meant to be evaluated *inside* the INSERT that consumes
 * it. Folding allocation into the write removes the read-then-write gap the old
 * async helper had — where two concurrent creates round-trip a `max(position)`
 * read, both see the same value, and insert colliding positions.
 *
 * SQLite serializes writers, so this is exact there. Under Postgres READ
 * COMMITTED two truly-simultaneous inserts can still read the same max before
 * either commits; fully serializing would need a row lock, which the create path
 * intentionally avoids (see createChartConfigPair / the bun:sqlite async-tx note
 * in lensRunQueries). This closes the wide app-level window without a lock.
 */
export const nextWorkspaceItemPositionSql = (workspaceId: string): SQL<number> =>
    sql<number>`(
        select coalesce(max(pos), -1) + 1
        from (
            select ${charts.position} as pos from ${charts} where ${charts.workspaceId} = ${workspaceId}
            union all
            select ${documents.position} as pos from ${documents} where ${documents.workspaceId} = ${workspaceId}
        ) as workspace_positions
    )`;
