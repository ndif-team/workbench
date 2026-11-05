"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { seedWorkshopChart } from "@/lib/queries/chartDb";
import {
    getWorkshopBySlug,
    getWorkshopWorkspaceForUser,
    isUniqueViolation,
} from "@/lib/queries/workshopDb";
import { createWorkspace, setWorkspaceProlificIfEmpty } from "@/lib/queries/workspaceDb";
import { isWorkshopExpired } from "@/lib/workshop";
import { openWorkspacePath, toolChartPath } from "@/lib/chartRoutes";
import { after } from "next/server";
import { PostHogServer } from "@/lib/posthog-server";
import type { ProlificParams } from "@/lib/prolific";

type JoinWorkshopResult =
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
    prolific?: ProlificParams | null,
): Promise<JoinWorkshopResult> {
    const workshop = await getWorkshopBySlug(slug);
    if (!workshop) {
        return { ok: false, error: "Workshop not found" };
    }
    // Re-check expiry: page render and this action are separate requests.
    if (isWorkshopExpired(workshop)) {
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
            after(() =>
                PostHogServer.captureException(error ?? new Error(message), undefined, {
                    source: "workshop_sign_in",
                }),
            );
            return { ok: false, error: message };
        }
        user = data.user;
    }
    if (!user) {
        return { ok: false, error: "Could not sign you in" };
    }

    // Stamp the gated-model claim on anonymous participants, plus any Prolific
    // study IDs (the offline join key back to the participant — see
    // workspaces.prolific). Real (OAuth) accounts already pass the backend's
    // gated check via their email, so their metadata is left untouched.
    // Re-stamping on a re-click is a no-op.
    if (!authDisabled && !user.email) {
        const appMetadata: Record<string, string> = { workshop_slug: slug };
        if (prolific?.prolificPid) appMetadata.prolific_pid = prolific.prolificPid;
        if (prolific?.studyId) appMetadata.study_id = prolific.studyId;
        if (prolific?.sessionId) appMetadata.session_id = prolific.sessionId;

        const admin = createAdminClient();
        const { error } = await admin.auth.admin.updateUserById(user.id, {
            app_metadata: appMetadata,
        });
        if (error) {
            console.error("Failed to stamp workshop claim:", error.message);
            const userId = user.id;
            after(() =>
                PostHogServer.captureException(error, userId, { source: "workshop_claim" }),
            );
            return { ok: false, error: "Could not grant workshop access" };
        }
    }

    // Idempotent re-click: reuse this participant's existing workspace. The
    // workspace page routes to its most recent chart.
    const existing = await getWorkshopWorkspaceForUser(user.id, workshop.id);
    if (existing) {
        // Backfill Prolific IDs if this participant first joined without them
        // (first-touch wins, so this is a no-op once any are recorded).
        if (prolific) {
            await setWorkspaceProlificIfEmpty(existing.id, prolific);
        }
        return { ok: true, redirectTo: openWorkspacePath(existing.id) };
    }

    // The lookup above is check-then-act; the unique index on
    // (userId, workshopId) makes concurrent joins converge — the loser's
    // insert conflicts and it reuses the winner's workspace.
    let workspace;
    try {
        workspace = await createWorkspace(user.id, workshop.name, workshop.id, prolific);
    } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        const winner = await getWorkshopWorkspaceForUser(user.id, workshop.id);
        if (!winner) throw err;
        return { ok: true, redirectTo: openWorkspacePath(winner.id) };
    }
    const { chart, tool } = await seedWorkshopChart(workspace.id, workshop);

    // Keyed by the user id, the only identifier PostHog holds; no Prolific params.
    after(async () => {
        const context = { workspace_id: workspace.id, workshop_id: workshop.id, mode: "workshop" };
        await PostHogServer.capture(user.id, "workshop_joined", { tool, ...context });
        await PostHogServer.capture(user.id, "chart_created", {
            tool,
            origin: "workshop_join",
            reused: false,
            chart_id: chart.id,
            ...context,
        });
    });

    return { ok: true, redirectTo: toolChartPath(chart.id, tool) };
}
