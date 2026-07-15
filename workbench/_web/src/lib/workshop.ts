/**
 * Workshop claim helpers. Isomorphic (no db / server imports): the claim is
 * `app_metadata.workshop_slug`, stamped on anonymous participants by the join
 * action via the Supabase admin API.
 */

type ClaimUser = { app_metadata?: Record<string, unknown> } | null | undefined;

export const getWorkshopSlugClaim = (user: ClaimUser): string | null => {
    const slug = user?.app_metadata?.workshop_slug;
    return typeof slug === "string" && slug.length > 0 ? slug : null;
};

export const hasWorkshopClaim = (user: ClaimUser): boolean => getWorkshopSlugClaim(user) !== null;

/** Single source of truth for join-link expiry — used by the /w page and the join action. */
export const isWorkshopExpired = (workshop: { expiresAt: Date }): boolean =>
    workshop.expiresAt < new Date();

/**
 * Synthetic backend identity for anonymous workshop participants. Anything
 * other than "guest@localhost" passes the FastAPI gated-model check
 * (_api/auth.py: user_has_model_access), and keying on the Supabase uid keeps
 * per-participant telemetry distinct.
 */
export const workshopEmailFor = (userId: string): string => `workshop+${userId}@anon.workbench`;
