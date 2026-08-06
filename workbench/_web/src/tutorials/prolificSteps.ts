/**
 * Step ids for the **seeded demo** Patch Lens tutorial (`prolificSeed.ts`).
 *
 * These are not the canonical contract they once were: tutorial content is
 * DB-backed, so a workshop's own tutorial may add, drop or rename units. Anything
 * that has to agree with what a participant actually ran derives from the loaded
 * content instead:
 *  - order + labels: `getTutorialStepMetaForWorkshop` (tutorialContentDb.ts),
 *  - the completion gate: the last unit of the loaded content
 *    (`isLast = unitIdx === total - 1`, `finalStepId = stepOrder.at(-1)`).
 *
 * So what is left here is the seed's own vocabulary, plus a label fallback for an
 * id whose tutorial row no longer exists. The 7 seed units mirror the workshop's
 * full gradient: single-prompt lens → comparison → patching.
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

/** The seed's units in flow order (the seed test asserts the two agree). */
export const TUTORIAL_STEP_ORDER: readonly TutorialStepId[] = [
    TUTORIAL_STEP_IDS.orientation,
    TUTORIAL_STEP_IDS.whereAnswersComeFrom,
    TUTORIAL_STEP_IDS.whatModelKnows,
    TUTORIAL_STEP_IDS.patternsBeatFacts,
    TUTORIAL_STEP_IDS.moveAThought,
    TUTORIAL_STEP_IDS.explore,
    TUTORIAL_STEP_IDS.finalChallenge,
];

/** The seed's last unit. A workshop's gate is the last unit of *its* content. */
export const TUTORIAL_FINAL_STEP_ID = TUTORIAL_STEP_IDS.finalChallenge;

/** Label fallback for the funnel / participant table (content titles win). */
export const TUTORIAL_STEP_LABELS: Record<TutorialStepId, string> = {
    "u0-orientation": "Orientation",
    "u1-answers": "Where answers come from",
    "u2-knows": "What the model knows",
    "u3-patterns": "Patterns beat facts",
    "u4-patching": "Move a thought",
    "u5-explore": "Explore",
    "u6-challenge": "Final challenge",
};
