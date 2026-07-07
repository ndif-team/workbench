import { randomBytes } from "crypto";

import { db } from "@/db/client";
import { workshops, workspaces, workshopTools } from "@/db/schema";
import type { Workshop, Workspace, WorkshopTool } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

/**
 * Unguarded workshop DB internals. The "use server" RPC surface lives in
 * workshopQueries.ts, which wraps the admin mutations in requireAdmin();
 * keeping the internals here makes them directly testable under bun:test
 * (no Supabase session to fake) and keeps the guarded/unguarded split explicit.
 */

// 128 bits, base64url → 22 chars. The slug is the only credential a join link
// carries, so it must be unguessable.
export const generateWorkshopSlug = (): string => randomBytes(16).toString("base64url");

export type WorkshopInput = {
    name: string;
    allowedTools: WorkshopTool[];
    model: string;
    starterPrompt: string;
    allowModelChange: boolean;
    expiresAt: Date;
    createdBy: string;
};

const validateTools = (tools: WorkshopTool[]) => {
    const unknown = tools.filter((t) => !(workshopTools as readonly string[]).includes(t));
    if (unknown.length > 0) {
        throw new Error(`Unknown workshop tool(s): ${unknown.join(", ")}`);
    }
    if (tools.length === 0) {
        throw new Error("Workshop must allow at least one tool");
    }
    return tools;
};

// Both drivers' unique-violation messages: better-sqlite3/bun:sqlite say
// "UNIQUE constraint failed", postgres-js says "duplicate key value violates
// unique constraint".
export const isUniqueViolation = (err: unknown): boolean =>
    err instanceof Error && /unique constraint|duplicate key/i.test(err.message);

export const getWorkshopBySlug = async (slug: string): Promise<Workshop | null> => {
    const [workshop] = await db.select().from(workshops).where(eq(workshops.slug, slug)).limit(1);
    return (workshop ?? null) as Workshop | null;
};

export const getWorkshopById = async (id: string): Promise<Workshop | null> => {
    const [workshop] = await db.select().from(workshops).where(eq(workshops.id, id)).limit(1);
    return (workshop ?? null) as Workshop | null;
};

/** The workshop a workspace was created through, or null for normal workspaces. */
export const getWorkshopForWorkspace = async (workspaceId: string): Promise<Workshop | null> => {
    const rows = await db
        .select({ workshop: workshops })
        .from(workspaces)
        .innerJoin(workshops, eq(workspaces.workshopId, workshops.id))
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
    return (rows[0]?.workshop ?? null) as Workshop | null;
};

/** Existing workspace for a (participant, workshop) pair — makes re-clicking a join link idempotent. */
export const getWorkshopWorkspaceForUser = async (
    userId: string,
    workshopId: string,
): Promise<Workspace | null> => {
    const [workspace] = await db
        .select()
        .from(workspaces)
        .where(and(eq(workspaces.userId, userId), eq(workspaces.workshopId, workshopId)))
        .orderBy(desc(workspaces.updatedAt))
        .limit(1);
    return (workspace ?? null) as Workspace | null;
};

export type WorkshopWithCount = Workshop & { participantCount: number };

export const listWorkshops = async (): Promise<WorkshopWithCount[]> => {
    // NOTE: cast — the joined select tips drizzle's dual-schema inference into
    // widening the row type to `any` (same issue as getChartsMetadata).
    const rows = (await db
        .select({
            workshop: workshops,
            participantCount: sql<number>`cast(count(${workspaces.id}) as integer)`,
        })
        .from(workshops)
        .leftJoin(workspaces, eq(workshops.id, workspaces.workshopId))
        .groupBy(workshops.id)
        .orderBy(desc(workshops.createdAt))) as Array<{
        workshop: Workshop;
        participantCount: number | null;
    }>;

    return rows.map((r) => ({
        ...r.workshop,
        participantCount: Number(r.participantCount ?? 0),
    }));
};

export const createWorkshop = async (input: WorkshopInput): Promise<Workshop> => {
    const values = { ...input, allowedTools: validateTools(input.allowedTools) };
    // One retry on the (astronomically unlikely) slug collision; anything else
    // surfaces immediately.
    for (let attempt = 0; ; attempt++) {
        try {
            const [workshop] = await db
                .insert(workshops)
                .values({ ...values, slug: generateWorkshopSlug() })
                .returning();
            return workshop as Workshop;
        } catch (err) {
            if (attempt >= 1 || !isUniqueViolation(err)) throw err;
        }
    }
};

export const updateWorkshop = async (
    id: string,
    updates: Partial<Omit<WorkshopInput, "createdBy">>,
): Promise<Workshop> => {
    if (updates.allowedTools) {
        updates = { ...updates, allowedTools: validateTools(updates.allowedTools) };
    }
    const [workshop] = await db
        .update(workshops)
        .set(updates)
        .where(eq(workshops.id, id))
        .returning();
    if (!workshop) {
        throw new Error("Workshop not found");
    }
    return workshop as Workshop;
};

export const deleteWorkshop = async (id: string): Promise<void> => {
    // pg carries an "on delete set null" FK, but sqlite mirrors are plain
    // columns (repo convention), so null the pointers explicitly — same
    // behavior on both backends: participant workspaces degrade to normal
    // ones. Sequential rather than a transaction: drizzle's better-sqlite3
    // driver rejects async transaction callbacks ("Transaction function
    // cannot return a promise"), and a partial failure here just leaves
    // orphan-free workspaces with the workshop still listed — retry converges.
    await db.update(workspaces).set({ workshopId: null }).where(eq(workspaces.workshopId, id));
    await db.delete(workshops).where(eq(workshops.id, id));
};
