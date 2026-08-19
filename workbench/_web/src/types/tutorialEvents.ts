// Shared types for the append-only tutorial_events telemetry table (both DB
// dialects import these). One row per event; the flexible `payload` JSON keeps
// the user-facing shape evolvable without a schema change. All tutorial
// telemetry lives in the app DB only — never PostHog (observation/answer text
// must not leave the app DB).

import type { UnitCheck } from "./tutorial-content";

export const tutorialEventTypes = [
    "step_started",
    "step_completed",
    "hint_shown",
    "observation_submitted",
    "check_answered",
] as const;

export type TutorialEventType = (typeof tutorialEventTypes)[number];

// Per-event payload. Fields are event-type-specific and all optional so the
// same JSON column serves every event kind; promote a field to a real column
// only if it becomes hot to query.
export interface TutorialEventPayload {
    // hint_shown: which rung of the 3-stage ladder was revealed (1=nudge,
    // 2=concrete suggestion, 3=show-me).
    hintStage?: number;
    // observation_submitted: the free-text the participant wrote.
    observationText?: string;
    // check_answered: the participant's answer + whether it was correct.
    answer?: string;
    correct?: boolean;
    // check_answered: the answer key the answer was scored against, and which
    // kind of check produced it. `correct` alone cannot be re-derived after the
    // fact — a run-scored key comes from the participant's own run, and the
    // comparison is a lenient string match — so the key is logged alongside the
    // verdict. That keeps post-hoc re-grading (with a different normaliser, or by
    // hand) possible from the event row on its own, which matters now that the
    // participant is no longer shown whether they were right. Absent on rows
    // written before this field existed.
    expected?: string;
    checkKind?: UnitCheck["kind"];
    // Attempt counter context (e.g. which failed-run attempt triggered a hint).
    attempt?: number;
}
