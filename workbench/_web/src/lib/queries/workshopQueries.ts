"use server";

import { requireAdmin } from "@/lib/auth/admin";
import * as workshopDb from "@/lib/queries/workshopDb";
import type { WorkshopInput, WorkshopWithCount } from "@/lib/queries/workshopDb";
import type { Workshop } from "@/db/schema";

// ---- Public reads (capability = knowing the slug / being in the workspace) ----

export async function getWorkshopBySlug(slug: string): Promise<Workshop | null> {
    return workshopDb.getWorkshopBySlug(slug);
}

export async function getWorkshopForWorkspace(workspaceId: string): Promise<Workshop | null> {
    return workshopDb.getWorkshopForWorkspace(workspaceId);
}

// ---- Admin CRUD (every entry point re-checks the allowlist; these are public RPCs) ----

export async function listWorkshops(): Promise<WorkshopWithCount[]> {
    await requireAdmin();
    return workshopDb.listWorkshops();
}

export async function createWorkshop(input: Omit<WorkshopInput, "createdBy">): Promise<Workshop> {
    const adminEmail = await requireAdmin();
    return workshopDb.createWorkshop({ ...input, createdBy: adminEmail });
}

export async function updateWorkshop(
    id: string,
    updates: Partial<Omit<WorkshopInput, "createdBy">>,
): Promise<Workshop> {
    await requireAdmin();
    return workshopDb.updateWorkshop(id, updates);
}

export async function deleteWorkshop(id: string): Promise<void> {
    await requireAdmin();
    return workshopDb.deleteWorkshop(id);
}
