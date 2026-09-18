"use server";

import * as tutorialEventsDb from "@/lib/queries/tutorialEventsDb";
import type { RecordTutorialEventInput } from "@/lib/queries/tutorialEventsDb";
import { tutorialEventTypes } from "@/types/tutorialEvents";
// Type-only, so the "use server" rule that every export be an async function is
// unaffected (same reason RecordTutorialEventInput is imported this way).
import type { TutorialNote } from "@/types/tutorialEvents";

/**
 * Participant-facing tutorial telemetry write. Unguarded by design: the
 * capability is owning the workspace, which the client already holds via the
 * route (same trust model as createLensRun — participants are anonymous
 * workspace owners, not admins). App DB only; this text never reaches PostHog.
 *
 * The admin-guarded analytics *reads* live in workshopAnalyticsQueries.ts, which
 * calls requireAdmin() and composes the tutorialEventsDb aggregators.
 */
export async function recordTutorialEvent(input: RecordTutorialEventInput): Promise<void> {
    // This is a public RPC; validate before writing so a malformed/hostile call
    // can't stuff the append-only table with unknown event types or oversized
    // step ids (the stepId column is varchar(64)).
    if (!(tutorialEventTypes as readonly string[]).includes(input.eventType)) {
        throw new Error(`Unknown tutorial event type: ${input.eventType}`);
    }
    if (!input.workspaceId || !input.stepId || input.stepId.length > 64) {
        throw new Error("Invalid tutorial event: missing workspaceId/stepId or stepId too long");
    }
    // Fire-and-forget from the caller's POV: record the event, swallow nothing —
    // the manager awaits but never blocks the UI on it.
    await tutorialEventsDb.insertTutorialEvent(input);
}

/**
 * The participant's own reflections for one workspace, latest per step — the
 * read side of the observation_submitted write above. Powers the "Your notes"
 * popover in the tutorial panel header and the recap on the completion screen.
 *
 * Unguarded, deliberately, for the same reason as the write: the capability is
 * owning the workspace, and the client already holds that workspace id via the
 * route. Participants are anonymous workspace owners rather than admins, and in
 * workshop mode there is no session to check the id against. Precedent for
 * unguarded reads keyed exactly this way: resolveTutorialForWorkspace and
 * getWorkspaceById.
 *
 * Residual exposure, stated plainly: anyone holding a workspace's uuid can read
 * that participant's free text. Accepted because the id is unguessable and
 * appears only in that participant's own URL, and the notes are pseudonymous
 * reflections about a heatmap. If either stops being true — notes that could
 * carry anything identifying, or ids that travel — guard *this function* with a
 * workspaces.user_id check rather than the whole file, since the write above
 * has to stay reachable by the anonymous owner.
 *
 * Filters by event type in TS rather than adding a dialect-specific
 * `WHERE event_type`, matching the other derivations: one participant's whole
 * timeline is tens of rows against the existing (workspace_id, created_at)
 * index.
 */
export async function getTutorialNotesForWorkspace(workspaceId: string): Promise<TutorialNote[]> {
    if (!workspaceId) return [];
    const events = await tutorialEventsDb.getTutorialEventsForWorkspace(workspaceId);
    return tutorialEventsDb.deriveLatestNotes(events);
}
