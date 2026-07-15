"use server";

import { requireAdmin } from "@/lib/auth/admin";
import * as workshopDb from "@/lib/queries/workshopDb";
import type { WorkshopInput, WorkshopWithCount } from "@/lib/queries/workshopDb";
import {
    createLens2ChartPair,
    createActivationPatchingChartPair,
    createPatchLensChartPair,
} from "@/lib/queries/chartQueries";
import type { Workshop, Workspace, WorkshopTool, Chart } from "@/db/schema";
import type { Lens2ConfigData } from "@/types/lens2";
import type { ActivationPatchingConfigData } from "@/types/activationPatching";

// ---- Public reads (capability = knowing the slug / being in the workspace) ----

export async function getWorkshopBySlug(slug: string): Promise<Workshop | null> {
    return workshopDb.getWorkshopBySlug(slug);
}

export async function getWorkshopForWorkspace(workspaceId: string): Promise<Workshop | null> {
    return workshopDb.getWorkshopForWorkspace(workspaceId);
}

export async function getWorkshopWorkspaceForUser(
    userId: string,
    workshopId: string,
): Promise<Workspace | null> {
    return workshopDb.getWorkshopWorkspaceForUser(userId, workshopId);
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

// ---- Chart seeding ----

/**
 * Creates the first chart for a workshop workspace: the workshop's first
 * allowed tool, pinned to its model, seeded with its starter prompt. Shared by
 * the join action and the workspace page's create-default-chart path. Tool
 * names double as route segments (/workbench/{ws}/{tool}/{chart}).
 */
export async function seedWorkshopChart(
    workspaceId: string,
    workshop: Workshop,
): Promise<{ chart: Chart; tool: WorkshopTool }> {
    const tool = workshop.allowedTools[0] ?? "lens2";

    if (tool === "activation-patching") {
        const config: ActivationPatchingConfigData = {
            model: workshop.model,
            srcPrompt: workshop.starterPrompt,
            tgtPrompt: "",
            srcPos: [],
            tgtPos: [],
            tgtFreeze: [],
        };
        const { chart } = await createActivationPatchingChartPair(workspaceId, config);
        return { chart, tool };
    }

    if (tool === "patch-lens") {
        // Patch-lens configs are empty ({}); its model comes from the workspace
        // store, which ModelControl pins for workshop workspaces. The prompts
        // live on the chart row's `data`, so the starter prompt seeds there.
        const { chart } = await createPatchLensChartPair(workspaceId, {
            sourcePrompt: workshop.starterPrompt,
            targetPrompt: "",
        });
        return { chart, tool };
    }

    const config: Lens2ConfigData = {
        model: workshop.model,
        prompt: workshop.starterPrompt,
        topk: 5,
        includeEntropy: true,
    };
    const { chart } = await createLens2ChartPair(workspaceId, config);
    return { chart, tool };
}
