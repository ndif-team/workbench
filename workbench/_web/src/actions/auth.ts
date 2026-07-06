"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasWorkshopClaim, workshopEmailFor } from "@/lib/workshop";

/**
 * Consume a magic-link `token_hash` and establish a session. Driven by the
 * button on /auth/magic-link (a two-step so link prefetchers don't burn the
 * single-use token). verifyOtp runs on the SSR server client so @supabase/ssr
 * writes the session cookies; on success we land in the workbench, on failure
 * we bounce back to the page with the error surfaced.
 */
export async function signInWithMagicLinkAction(formData: FormData): Promise<void> {
    const tokenHash = String(formData.get("token_hash") ?? "");
    if (!tokenHash) {
        redirect(`/auth/magic-link?error=${encodeURIComponent("Missing sign-in token")}`);
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "magiclink",
    });
    if (error) {
        redirect(`/auth/magic-link?error=${encodeURIComponent(error.message)}`);
    }

    redirect("/workbench");
}

/**
 * Server action to get the current user's email using server-side Supabase client
 * This can access HTTP-only cookies and is more secure than client-side auth
 */
export async function getCurrentUserEmailAction(): Promise<string | null> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
            error,
        } = await supabase.auth.getUser();

        if (error) {
            console.log("Server: Auth error:", error.message);
            return null;
        }

        if (!user) {
            return "guest@localhost";
        }

        if (user.email) {
            return user.email;
        }

        // Anonymous workshop participants get a unique synthetic identity so
        // the backend treats them as signed in (gated models) and telemetry
        // stays per-participant; plain anonymous guests keep the shared one.
        if (hasWorkshopClaim(user)) {
            return workshopEmailFor(user.id);
        }

        return "guest@localhost";
    } catch (error) {
        console.warn("Server: Failed to get user email:", error);
        return null;
    }
}

/**
 * Server action to create headers with user email
 * Returns headers object that can be used in API calls
 */
export async function createUserHeadersAction(): Promise<Record<string, string>> {
    const userEmail = await getCurrentUserEmailAction();

    if (!userEmail) {
        return {};
    }

    return {
        "X-User-Email": userEmail,
    };
}
