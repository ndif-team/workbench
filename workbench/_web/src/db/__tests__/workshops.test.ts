/**
 * Integration tests for the workshops entity on SQLite.
 *
 * Exercises the unguarded internals in lib/queries/workshopDb.ts (the
 * requireAdmin-wrapped RPCs in workshopQueries.ts need a Supabase session and
 * are just thin guards over these). Covers create/getBySlug, slug uniqueness
 * and shape, the workspace→workshop join, the idempotent-rejoin lookup,
 * updates, and delete nulling participant workspaces' workshopId.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { clearDatabase } from "../client";
import {
    generateWorkshopSlug,
    getWorkshopBySlug,
    getWorkshopForWorkspace,
    getWorkshopWorkspaceForUser,
    listWorkshops,
    createWorkshop,
    updateWorkshop,
    deleteWorkshop,
} from "@/lib/queries/workshopDb";
import { createWorkspace, getWorkspaceById } from "@/lib/queries/workspaceQueries";
import type { WorkshopTool } from "@/db/schema";

const USER = "anon-user-1";

const input = (overrides: Partial<Parameters<typeof createWorkshop>[0]> = {}) => ({
    name: "Faculty Pilot",
    allowedTools: ["patch-lens"] as WorkshopTool[],
    model: "meta-llama/Llama-3.1-8B",
    starterPrompt: "The Eiffel Tower is in",
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    createdBy: "admin@example.edu",
    ...overrides,
});

describe("workshops", () => {
    beforeEach(async () => {
        await clearDatabase();
    });

    it("creates a workshop and reads it back by slug", async () => {
        const created = await createWorkshop(input());

        expect(created.id).toBeTruthy();
        expect(created.slug.length).toBeGreaterThanOrEqual(22);

        const fetched = await getWorkshopBySlug(created.slug);
        expect(fetched).not.toBeNull();
        expect(fetched!.id).toBe(created.id);
        expect(fetched!.allowedTools).toEqual(["patch-lens"]);
        expect(fetched!.model).toBe("meta-llama/Llama-3.1-8B");
        expect(fetched!.starterPrompt).toBe("The Eiffel Tower is in");
        expect(fetched!.expiresAt.getTime()).toBeGreaterThan(Date.now());
        expect(fetched!.createdBy).toBe("admin@example.edu");
    });

    it("mints unguessable, distinct slugs", async () => {
        const slugs = new Set(Array.from({ length: 100 }, () => generateWorkshopSlug()));
        expect(slugs.size).toBe(100);
        for (const slug of slugs) {
            expect(slug).toMatch(/^[A-Za-z0-9_-]{22}$/);
        }

        const a = await createWorkshop(input());
        const b = await createWorkshop(input({ name: "Second" }));
        expect(a.slug).not.toBe(b.slug);
    });

    it("rejects a workshop with no valid tools", async () => {
        expect(createWorkshop(input({ allowedTools: [] }))).rejects.toThrow("at least one tool");
    });

    it("resolves a workspace's workshop through workshopId, null otherwise", async () => {
        const workshop = await createWorkshop(input());
        const stamped = await createWorkspace(USER, "Faculty Pilot", workshop.id);
        const plain = await createWorkspace(USER, "Personal");

        const found = await getWorkshopForWorkspace(stamped.id);
        expect(found).not.toBeNull();
        expect(found!.id).toBe(workshop.id);

        expect(await getWorkshopForWorkspace(plain.id)).toBeNull();
    });

    it("finds the existing (user, workshop) workspace for idempotent re-joins", async () => {
        const workshop = await createWorkshop(input());
        const other = await createWorkshop(input({ name: "Other" }));

        expect(await getWorkshopWorkspaceForUser(USER, workshop.id)).toBeNull();

        const ws = await createWorkspace(USER, "Faculty Pilot", workshop.id);
        await createWorkspace(USER, "Other Session", other.id);
        await createWorkspace("someone-else", "Their Session", workshop.id);

        const found = await getWorkshopWorkspaceForUser(USER, workshop.id);
        expect(found).not.toBeNull();
        expect(found!.id).toBe(ws.id);
    });

    it("lists workshops with participant counts", async () => {
        const a = await createWorkshop(input({ name: "A" }));
        const b = await createWorkshop(input({ name: "B" }));
        await createWorkspace("u1", "A ws", a.id);
        await createWorkspace("u2", "A ws", a.id);

        const list = await listWorkshops();
        expect(list.length).toBe(2);
        const byId = new Map(list.map((w) => [w.id, w]));
        expect(byId.get(a.id)!.participantCount).toBe(2);
        expect(byId.get(b.id)!.participantCount).toBe(0);
    });

    it("updates tools and expiry", async () => {
        const workshop = await createWorkshop(input());
        const newExpiry = new Date(Date.now() - 1000);

        const updated = await updateWorkshop(workshop.id, {
            allowedTools: ["lens2", "activation-patching"],
            expiresAt: newExpiry,
        });

        expect(updated.allowedTools).toEqual(["lens2", "activation-patching"]);
        // sqlite timestamps are second precision
        expect(Math.abs(updated.expiresAt.getTime() - newExpiry.getTime())).toBeLessThan(1000);
        expect(updated.slug).toBe(workshop.slug);
    });

    it("delete nulls participant workspaces' workshopId (workspace survives)", async () => {
        const workshop = await createWorkshop(input());
        const ws = await createWorkspace(USER, "Faculty Pilot", workshop.id);

        await deleteWorkshop(workshop.id);

        expect(await getWorkshopBySlug(workshop.slug)).toBeNull();
        const survivor = await getWorkspaceById(ws.id);
        expect(survivor).not.toBeNull();
        expect(survivor!.workshopId).toBeNull();
        expect(await getWorkshopForWorkspace(ws.id)).toBeNull();
    });
});
