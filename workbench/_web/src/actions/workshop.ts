"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
    getWorkshopBySlug,
    getWorkshopWorkspaceForUser,
    seedWorkshopChart,
} from "@/lib/queries/workshopQueries";
import { createWorkspace } from "@/lib/queries/workspaceQueries";

export type JoinWorkshopResult =
    | { ok: true; redirectTo: string }
    | { ok: false; error: string; captchaRequired?: boolean };

/**
 * Turns a workshop join link into a signed-in participant with a workspace:
 * signs the visitor in anonymously (server action, so the @supabase/ssr client
 * can set the session cookies), stamps the workshop claim via the admin API,
 * and creates (or reuses) their workshop workspace with a seeded first chart.
 *
 * Whether anonymous sign-in demands an hCaptcha token is a Supabase project
 * setting; callers should try token-less first and render the widget when
 * `captchaRequired` comes back.
 */
export async function joinWorkshopAction(
    slug: string,
    captchaToken?: string,
): Promise<JoinWorkshopResult> {
    const workshop = await getWorkshopBySlug(slug);
    if (!workshop) {
        return { ok: false, error: "Workshop not found" };
    }
    // Re-check expiry: page render and this action are separate requests.
    if (workshop.expiresAt < new Date()) {
        return { ok: false, error: "This workshop has ended" };
    }

    const authDisabled = process.env.NEXT_PUBLIC_DISABLE_AUTH === "true";
    const supabase = await createClient();
    let {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user && !authDisabled) {
        const { data, error } = await supabase.auth.signInAnonymously({
            options: captchaToken ? { captchaToken } : undefined,
        });
        if (error || !data?.user) {
            const message = error?.message ?? "Could not sign you in";
            if (message.toLowerCase().includes("captcha")) {
                return { ok: false, error: message, captchaRequired: true };
            }
            return { ok: false, error: message };
        }
        user = data.user;
    }
    if (!user) {
        return { ok: false, error: "Could not sign you in" };
    }

    // Stamp the gated-model claim on anonymous participants. Real (OAuth)
    // accounts already pass the backend's gated check via their email, so
    // their metadata is left untouched. Re-stamping on a re-click is a no-op.
    if (!authDisabled && !user.email) {
        const admin = createAdminClient();
        const { error } = await admin.auth.admin.updateUserById(user.id, {
            app_metadata: { workshop_slug: slug },
        });
        if (error) {
            console.error("Failed to stamp workshop claim:", error.message);
            return { ok: false, error: "Could not grant workshop access" };
        }
    }

    // Idempotent re-click: reuse this participant's existing workspace. The
    // workspace page routes to its most recent chart.
    const existing = await getWorkshopWorkspaceForUser(user.id, workshop.id);
    if (existing) {
        return { ok: true, redirectTo: `/workbench/${existing.id}` };
    }

    const workspace = await createWorkspace(user.id, workshop.name, workshop.id);
    const { chart, tool } = await seedWorkshopChart(workspace.id, workshop);
    return { ok: true, redirectTo: `/workbench/${workspace.id}/${tool}/${chart.id}` };
}
