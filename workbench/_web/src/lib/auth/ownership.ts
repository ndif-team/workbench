/**
 * Authorization for the per-user entity graph.
 *
 * The Drizzle server actions run as the `postgres` role, which bypasses RLS, so
 * the database enforces nothing for the app path — authorization has to happen
 * here. Every "use server" export is a publicly callable RPC endpoint (see the
 * note in ./admin.ts), so a server action that touches a user-owned row must
 * derive the caller from the session (never trust a client-supplied userId) and
 * ensure the row belongs to them.
 *
 * Two enforcement shapes, picked by whether there's a row to filter:
 *
 *  - READS / UPDATES / DELETES fold an ownership predicate straight into the
 *    statement's WHERE (`ownedByWorkspace` / `ownedByChart`). No pre-flight
 *    SELECT — the ownership check *is* the query, so an unowned id simply
 *    matches nothing (read → null/empty, write → 0 rows). One round-trip.
 *
 *  - INSERTS have no row to filter, so they verify the *parent* is owned first
 *    (`requireWorkspaceOwner` / `requireChartOwner`) — the one place a separate
 *    SELECT is unavoidable.
 *
 * Ownership roots at `workspaces.user_id`. Child entities resolve their owner by
 * walking back to the workspace: charts/configs/documents/lens_runs via
 * `workspace_id`; views via `chart_id -> charts`.
 */
import { db } from "@/db/client";
import { workspaces, charts } from "@/db/schema";
import { and, eq, exists, sql, type AnyColumn } from "drizzle-orm";

/** Thrown when the caller is unauthenticated or doesn't own the target row. */
export class ForbiddenError extends Error {
    constructor(message = "Forbidden") {
        super(message);
        this.name = "ForbiddenError";
    }
}

/**
 * The authenticated user's id, or throw. Under NEXT_PUBLIC_DISABLE_AUTH (local
 * dev + tests) this is the settable dev identity and no Supabase client is
 * constructed — which also keeps next/headers `cookies()` out of the bun:test
 * path. In production it reads the SSR session.
 */
export async function requireUserId(): Promise<string> {
    if (process.env.NEXT_PUBLIC_DISABLE_AUTH === "true") {
        // Fail closed: DISABLE_AUTH hands every public server action the synthetic
        // dev identity, so it must never be honored in a production build — a
        // misconfigured deploy would otherwise bypass session auth entirely.
        if (process.env.NODE_ENV === "production") {
            throw new ForbiddenError("Authentication cannot be disabled in production");
        }
        // Lazy import so the dev-identity module isn't bundled into prod paths.
        const { getDevUserId } = await import("./devUser");
        return getDevUserId();
    }
    // Perf note: getUser() is a network round-trip to Supabase Auth, and each
    // guarded RPC is a separate request, so opening a chart (getChartById +
    // getConfigForChart + getView + getChartsMetadata) spends one round-trip per
    // action. Within-request memoization wouldn't help (they're separate
    // requests); collapsing this to a single per-navigation validation is an
    // auth-architecture change left as a follow-up.
    //
    // Lazy import so the Next-only supabase/server module (and its next/headers
    // dependency) is never pulled into the DISABLE_AUTH / test path.
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new ForbiddenError("Not authenticated");
    return user.id;
}

/**
 * SQL predicate: the row whose workspace-fk column is `workspaceIdCol` is owned
 * by `userId`. A correlated `EXISTS` against `workspaces` — folds into any
 * WHERE on a table that carries a `workspace_id`, on both dialects.
 */
export function ownedByWorkspace(workspaceIdCol: AnyColumn, userId: string) {
    return exists(
        db
            .select({ one: sql`1` })
            .from(workspaces)
            .where(and(eq(workspaces.id, workspaceIdCol), eq(workspaces.userId, userId))),
    );
}

/**
 * SQL predicate: the row whose chart-fk column is `chartIdCol` is owned by
 * `userId`, resolved via `chart -> workspace`. For tables that reference a chart
 * (views) rather than a workspace directly.
 */
export function ownedByChart(chartIdCol: AnyColumn, userId: string) {
    return exists(
        db
            .select({ one: sql`1` })
            .from(charts)
            .innerJoin(workspaces, eq(charts.workspaceId, workspaces.id))
            .where(and(eq(charts.id, chartIdCol), eq(workspaces.userId, userId))),
    );
}

/**
 * Assert the caller owns `workspaceId`; returns the caller's user id. For
 * INSERTs that need to confirm the parent workspace before writing a child.
 */
export async function requireWorkspaceOwner(workspaceId: string): Promise<string> {
    const userId = await requireUserId();
    const [row] = await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)))
        .limit(1);
    if (!row) throw new ForbiddenError("Workspace not found or access denied");
    return userId;
}

/**
 * Assert the caller owns the chart's workspace; returns id + workspaceId. For
 * INSERTs/copies that hang a new row off an existing chart.
 */
export async function requireChartOwner(
    chartId: string,
): Promise<{ userId: string; workspaceId: string }> {
    const userId = await requireUserId();
    const [row] = await db
        .select({ workspaceId: charts.workspaceId })
        .from(charts)
        .innerJoin(workspaces, eq(charts.workspaceId, workspaces.id))
        .where(and(eq(charts.id, chartId), eq(workspaces.userId, userId)))
        .limit(1);
    if (!row) throw new ForbiddenError("Chart not found or access denied");
    return { userId, workspaceId: row.workspaceId };
}
