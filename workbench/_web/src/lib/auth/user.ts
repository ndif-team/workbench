import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { getParticipantWorkspace } from "@/lib/queries/workshopDb";
import { createClient } from "@/lib/supabase/server";
import {
    getWorkshopSlugClaim,
    workshopParticipant,
    type WorkshopParticipant,
} from "@/lib/workshop";

/** The signed-in user (the stub user when auth is disabled), or null when signed out. */
export async function getSessionUser(): Promise<User | null> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    return user ?? null;
}

/**
 * The signed-in user, resolved from the session. Server actions that act for
 * "the current user" call this (or `requireUserId`) rather than trusting a
 * client-supplied id, since "use server" exports are publicly callable RPC
 * endpoints.
 */
export async function requireUser(): Promise<User> {
    const user = await getSessionUser();
    if (!user) {
        throw new Error("Not signed in");
    }
    return user;
}

/** The signed-in user's id; see `requireUser`. */
export async function requireUserId(): Promise<string> {
    return (await requireUser()).id;
}

/**
 * Where `user` is kept when they are an anonymous workshop participant (they
 * carry the workshop claim, `hasWorkshopClaim`); null for everyone else.
 */
export async function getWorkshopParticipant(
    user: User | null,
): Promise<WorkshopParticipant | null> {
    const slug = getWorkshopSlugClaim(user);
    if (!user || !slug) return null;
    const workspace = await getParticipantWorkspace(user.id, slug);
    return workshopParticipant(workspace?.id ?? null, slug);
}

/**
 * Sends an anonymous workshop participant to their workshop. Pages outside a
 * workshop (the workbench entry, /new, the workspace pages, /models) call
 * this first, so participants stay inside the workshop's tools.
 */
export async function redirectWorkshopParticipant(user: User | null): Promise<void> {
    const participant = await getWorkshopParticipant(user);
    if (participant) redirect(participant.entryPath);
}
