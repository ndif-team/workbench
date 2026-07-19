"use server";

import * as tutorialEventsDb from "@/lib/queries/tutorialEventsDb";
import type { RecordTutorialEventInput } from "@/lib/queries/tutorialEventsDb";

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
    // Fire-and-forget from the caller's POV: record the event, swallow nothing —
    // the manager awaits but never blocks the UI on it.
    await tutorialEventsDb.insertTutorialEvent(input);
}
