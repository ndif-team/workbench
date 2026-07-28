"use server";

import * as tutorialEventsDb from "@/lib/queries/tutorialEventsDb";
import type { RecordTutorialEventInput } from "@/lib/queries/tutorialEventsDb";
import { tutorialEventTypes } from "@/types/tutorialEvents";

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
