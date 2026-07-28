/**
 * Canonical step-id contract for the Prolific Patch Lens tutorial (spec §3).
 *
 * These unit-level ids are the shared vocabulary between:
 *  - the tutorial content (which emits step_started / step_completed per unit),
 *  - the analytics funnel + furthest-step derivation (ordering), and
 *  - the completion gate (unit-6 step_completed reveals the Prolific code).
 *
 * The 7 units mirror the workshop's full gradient: single-prompt lens →
 * comparison → patching. Phase 3 authors each unit's reactour steps under the
 * matching id.
 */

export const TUTORIAL_STEP_IDS = {
    orientation: "u0-orientation",
    whereAnswersComeFrom: "u1-answers",
    whatModelKnows: "u2-knows",
    patternsBeatFacts: "u3-patterns",
    moveAThought: "u4-patching",
    explore: "u5-explore",
    finalChallenge: "u6-challenge",
} as const;

export type TutorialStepId = (typeof TUTORIAL_STEP_IDS)[keyof typeof TUTORIAL_STEP_IDS];

/** Units in flow order — drives funnel column order and furthest-step ranking. */
export const TUTORIAL_STEP_ORDER: readonly TutorialStepId[] = [
    TUTORIAL_STEP_IDS.orientation,
    TUTORIAL_STEP_IDS.whereAnswersComeFrom,
    TUTORIAL_STEP_IDS.whatModelKnows,
    TUTORIAL_STEP_IDS.patternsBeatFacts,
    TUTORIAL_STEP_IDS.moveAThought,
    TUTORIAL_STEP_IDS.explore,
    TUTORIAL_STEP_IDS.finalChallenge,
];

/** The step whose completion gates the Prolific completion code. */
export const TUTORIAL_FINAL_STEP_ID = TUTORIAL_STEP_IDS.finalChallenge;

/** Human labels for the funnel / participant table. */
export const TUTORIAL_STEP_LABELS: Record<TutorialStepId, string> = {
    "u0-orientation": "Orientation",
    "u1-answers": "Where answers come from",
    "u2-knows": "What the model knows",
    "u3-patterns": "Patterns beat facts",
    "u4-patching": "Move a thought",
    "u5-explore": "Explore",
    "u6-challenge": "Final challenge",
};
