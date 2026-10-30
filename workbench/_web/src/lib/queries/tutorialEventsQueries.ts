"use server";

import { requireUserId } from "@/lib/auth/user";
import * as tutorialEventsDb from "@/lib/queries/tutorialEventsDb";
import type { RecordTutorialEventInput } from "@/lib/queries/tutorialEventsDb";
import { tutorialEventTypes } from "@/types/tutorialEvents";
// Type-only, so the "use server" rule that every export be an async function is
// unaffected (same reason RecordTutorialEventInput is imported this way).
import type { TutorialNote } from "@/types/tutorialEvents";

/**
 * Participant-facing tutorial telemetry write, into one of the signed-in
 * user's workspaces. Anonymous workshop participants have sessions and own
 * their workshop workspace, so their events land as before; an event for
 * anyone else's workspace is refused. App DB only; this text never reaches
 * PostHog.
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
    await tutorialEventsDb.recordTutorialEvent(await requireUserId(), input);
}

/**
 * The participant's own reflections for one workspace, latest per step — the
 * read side of the observation_submitted write above. Powers the "Your notes"
 * popover in the tutorial panel header and the recap on the completion screen.
 *
 * Not owner-checked, unlike the write: keyed by the workspace id the client
 * already holds via the route. Precedent for unguarded reads keyed exactly
 * this way: resolveTutorialForWorkspace.
 *
 * Residual exposure, stated plainly: anyone holding a workspace's uuid can read
 * that participant's free text. Accepted because the id is unguessable and
 * appears only in that participant's own URL, and the notes are pseudonymous
 * reflections about a heatmap. If either stops being true — notes that could
 * carry anything identifying, or ids that travel — owner-check it like the
 * write above.
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
