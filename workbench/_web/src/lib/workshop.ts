/**
 * Workshop claim and allowed-tool helpers. Isomorphic (no db / server imports):
 * the claim is `app_metadata.workshop_slug`, stamped on anonymous participants
 * by the join action via the Supabase admin API.
 */

import { openWorkspacePath } from "@/lib/chartRoutes";
import { normalizeToolType } from "@/types/charts";
import type { WorkshopTool } from "@/db/schema";

type ClaimUser = { app_metadata?: Record<string, unknown> } | null | undefined;

/** The slug of the workshop an anonymous participant last joined, or null for everyone else. */
export const getWorkshopSlugClaim = (user: ClaimUser): string | null => {
    const slug = user?.app_metadata?.workshop_slug;
    return typeof slug === "string" && slug.length > 0 ? slug : null;
};

export const hasWorkshopClaim = (user: ClaimUser): boolean => getWorkshopSlugClaim(user) !== null;

/** A workshop's join link. */
export const workshopJoinPath = (slug: string): string => `/w/${slug}`;

/**
 * Where an anonymous workshop participant is kept: their workshop workspace,
 * and the page they are sent to instead of anything outside it.
 */
export type WorkshopParticipant = {
    /** Null until they have joined (the join link creates it). */
    workspaceId: string | null;
    entryPath: string;
};

/**
 * A participant's confinement: the open-workspace page of their workshop
 * workspace, or the join link of their claim's workshop until they have one.
 */
export const workshopParticipant = (
    workspaceId: string | null,
    slug: string,
): WorkshopParticipant => ({
    workspaceId,
    entryPath: workspaceId ? openWorkspacePath(workspaceId) : workshopJoinPath(slug),
});

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

/** A workshop's allowed tools under their current names (see `normalizeToolType`). */
export const normalizeWorkshopTools = (tools: readonly string[]): WorkshopTool[] =>
    tools.map((tool) => normalizeToolType(tool)) as WorkshopTool[];
