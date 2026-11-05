"use server";

import type { AlgorithmRow } from "@/db/schema";
import { requireUser, requireUserId } from "@/lib/auth/user";
import * as algorithmDb from "@/lib/queries/algorithmDb";
import type { AlgorithmListItem } from "@/lib/queries/algorithmDb";
import { assertChartWorkspace } from "@/lib/queries/chartDb";
import { hasWorkshopClaim } from "@/lib/workshop";
import type { AlgorithmDefinition } from "@/types/algorithmHypothesis";

/**
 * Algorithm Hypothesis algorithms: workspace-scoped rows holding a schema-v4
 * definition. Charts point at one by id, so several charts can share it.
 *
 * Each row has a working copy (`definition`, autosaved on every edit) and the
 * version last saved as complete (`savedDefinition`, null for a draft). Other
 * algorithms' predictions in the intervention view come from saved versions.
 *
 * Every action checks that the workspace or algorithm is the signed-in user's;
 * the queries themselves live in algorithmDb.ts.
 */

/** Checks that the workspace is the signed-in user's. */
async function requireWorkspace(workspaceId: string) {
    const user = await requireUser();
    await assertChartWorkspace(user.id, workspaceId, {
        workshopParticipant: hasWorkshopClaim(user),
    });
}

export async function createAlgorithm(
    workspaceId: string,
    definition: AlgorithmDefinition,
): Promise<AlgorithmRow> {
    await requireWorkspace(workspaceId);
    return algorithmDb.insertAlgorithm(workspaceId, definition);
}

export async function getAlgorithmById(id: string): Promise<AlgorithmRow | null> {
    return algorithmDb.getUserAlgorithm(await requireUserId(), id);
}

export async function getAlgorithmsForWorkspace(workspaceId: string): Promise<AlgorithmListItem[]> {
    await requireWorkspace(workspaceId);
    return algorithmDb.listAlgorithms(workspaceId);
}

/** The saved version of every saved algorithm in the workspace, for running
 * the same intervention on all of them. Drafts are left out. */
export async function getSavedAlgorithmsForWorkspace(
    workspaceId: string,
): Promise<{ id: string; definition: AlgorithmDefinition; savedAt: Date }[]> {
    await requireWorkspace(workspaceId);
    return algorithmDb.listSavedAlgorithms(workspaceId);
}

/** Save the algorithm as complete: the working copy becomes the saved version. */
export async function saveAlgorithmVersion(
    id: string,
    definition: AlgorithmDefinition,
): Promise<AlgorithmRow | null> {
    return algorithmDb.saveVersion(await requireUserId(), id, definition);
}

/** Replace the definition. The `name` column follows definition.name. */
export async function updateAlgorithm(
    id: string,
    definition: AlgorithmDefinition,
): Promise<AlgorithmRow | null> {
    return algorithmDb.writeDefinition(await requireUserId(), id, definition);
}
