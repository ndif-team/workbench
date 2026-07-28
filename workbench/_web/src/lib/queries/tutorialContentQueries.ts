"use server";

import { requireAdmin } from "@/lib/auth/admin";
import * as tutorialDb from "@/lib/queries/tutorialContentDb";
import type { TutorialInput } from "@/lib/queries/tutorialContentDb";
import type { Tutorial } from "@/db/schema";
import type { TutorialContent } from "@/types/tutorial-content";

// ---- Participant read (capability = being in the workspace) ----

export async function resolveTutorialForWorkspace(workspaceId: string): Promise<TutorialContent> {
    return tutorialDb.resolveTutorialForWorkspace(workspaceId);
}

// ---- Admin CRUD (every entry point re-checks the ADMIN_EMAILS allowlist) ----

export async function listTutorials(): Promise<Tutorial[]> {
    await requireAdmin();
    return tutorialDb.listTutorials();
}

export async function createTutorial(input: Omit<TutorialInput, "createdBy">): Promise<Tutorial> {
    const adminEmail = await requireAdmin();
    return tutorialDb.createTutorial({ ...input, createdBy: adminEmail });
}

export async function updateTutorial(
    id: string,
    updates: { name?: string; data?: TutorialContent },
): Promise<Tutorial> {
    await requireAdmin();
    return tutorialDb.updateTutorial(id, updates);
}

export async function deleteTutorial(id: string): Promise<void> {
    await requireAdmin();
    return tutorialDb.deleteTutorial(id);
}

/** Idempotently create the demo seed tutorial (admin-triggered convenience). */
export async function ensureSeedTutorial(): Promise<Tutorial> {
    await requireAdmin();
    return tutorialDb.ensureSeedTutorial();
}
