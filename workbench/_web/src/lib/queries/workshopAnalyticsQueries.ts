"use server";

import { requireAdmin } from "@/lib/auth/admin";
import * as analyticsDb from "@/lib/queries/workshopAnalyticsDb";
import type { WorkshopAnalytics } from "@/lib/queries/workshopAnalyticsDb";
import { getTutorialStepOrderForWorkshop } from "@/lib/queries/tutorialContentDb";

/**
 * Admin-guarded analytics RPC surface. Every export re-checks the ADMIN_EMAILS
 * allowlist — "use server" exports are publicly callable regardless of the
 * /admin layout gate. Delegates to the unguarded analyticsDb internals.
 *
 * The canonical step order comes from the workshop's assigned tutorial (not a
 * hard-coded constant), so the funnel/checks/progress stay correct for custom
 * or edited tutorials whose unit ids differ from the demo's.
 */

export async function getWorkshopAnalytics(workshopId: string): Promise<WorkshopAnalytics> {
    await requireAdmin();
    const stepOrder = await getTutorialStepOrderForWorkshop(workshopId);
    return analyticsDb.getWorkshopAnalytics(workshopId, stepOrder);
}

/** CSV of the per-participant rows + one row per observation (CHI analysis input). */
export async function exportWorkshopCsv(workshopId: string): Promise<string> {
    await requireAdmin();
    const stepOrder = await getTutorialStepOrderForWorkshop(workshopId);
    const analytics = await analyticsDb.getWorkshopAnalytics(workshopId, stepOrder);
    return analyticsDb.buildWorkshopCsv(analytics);
}
