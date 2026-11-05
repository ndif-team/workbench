import { useQuery } from "@tanstack/react-query";

import { getTutorialNotesForWorkspace } from "@/lib/queries/tutorialEventsQueries";
import { queryKeys } from "../queryKeys";

/**
 * The participant's own reflections for this workspace, latest per step.
 *
 * Cached hard: this list changes only when *this* participant saves a note, and
 * the panel seeds that note straight into the cache rather than invalidating.
 * Invalidating at save time would race the insert — the store's event write is
 * fire-and-forget, so a refetch fired from the same click can easily read the
 * table before the row lands and hand the participant back a list missing the
 * note they just wrote.
 *
 * `enabled` is the caller's own gate (e.g. only fetch inside an active
 * tutorial); it's ANDed with having a workspace id.
 */
export const useTutorialNotes = (workspaceId: string | undefined, enabled = true) =>
    useQuery({
        queryKey: queryKeys.tutorialEvents.notesByWorkspace(workspaceId ?? ""),
        queryFn: () => getTutorialNotesForWorkspace(workspaceId as string),
        enabled: !!workspaceId && enabled,
        staleTime: Infinity,
    });
