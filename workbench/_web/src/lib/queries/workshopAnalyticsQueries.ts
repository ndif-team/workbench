"use server";

import { requireAdmin } from "@/lib/auth/admin";
import * as analyticsDb from "@/lib/queries/workshopAnalyticsDb";
import type { WorkshopAnalytics } from "@/lib/queries/workshopAnalyticsDb";
import { TUTORIAL_STEP_ORDER } from "@/tutorials/prolificSteps";

/**
 * Admin-guarded analytics RPC surface. Every export re-checks the ADMIN_EMAILS
 * allowlist — "use server" exports are publicly callable regardless of the
 * /admin layout gate. Delegates to the unguarded analyticsDb internals.
 */

export async function getWorkshopAnalytics(workshopId: string): Promise<WorkshopAnalytics> {
    await requireAdmin();
    return analyticsDb.getWorkshopAnalytics(workshopId, TUTORIAL_STEP_ORDER);
}

/** CSV of the per-participant rows + one row per observation (CHI analysis input). */
export async function exportWorkshopCsv(workshopId: string): Promise<string> {
    await requireAdmin();
    const analytics = await analyticsDb.getWorkshopAnalytics(workshopId, TUTORIAL_STEP_ORDER);
    return analyticsDb.buildWorkshopCsv(analytics);
}
