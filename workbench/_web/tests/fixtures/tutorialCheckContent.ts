/**
 * Tutorial content for `tests/tutorial-checks.spec.ts` — deliberately hostile,
 * and small enough to drive end to end.
 *
 * Every shape the verdict feature can take is represented exactly once, because
 * the spec generates its cases from `CHECK_CASES` below: adding a unit with a
 * check here adds its correct/incorrect pair to the run.
 *
 * What each check is here to catch:
 *  - `u0` two similarly-worded options, key 0 — an index-vs-label bug. The panel
 *    keys options `${idx}-${option}` precisely because labels need not be
 *    unique, and it scores `idx === correctIndex`, never a string compare.
 *  - `u1` `correctIndex: 2` — a hardcoded zero. Also the copy guard: the exact
 *    visible verdict strings are pinned on this unit and nowhere else.
 *  - `u2` no `feedback` field at all — inheritance of the tutorial-level
 *    `checkFeedback`, proved in a real render rather than a unit test.
 *  - `u3` `feedback: "neutral"` against a `"verdict"` tutorial — the override,
 *    and the negative case: no verdict element may appear.
 *  - `u4` / `u5` run-scored (`topToken` / `secondToken`) with verdicts. Their
 *    keys come from the participant's own run, which the spec supplies by
 *    stubbing `/logit_lens/start` (see `buildLensData` in TestingUtils).
 *  - `u6` a *typed* neutral check, so the submit affordance can be read: the
 *    button says "Check" when a verdict is coming and "Submit" when one is not.
 *
 * No patch unit. The patch progression needs a drag across the edulogitlens
 * canvas — a day of work for one check — and it is covered by the manual
 * pre-flight checklist instead.
 */
import type { TutorialContent, TutorialUnit } from "@/types/tutorial-content";

/** The run stub's final-layer top-1 at the last position — the `topToken` key. */
export const RUN_TOP_TOKEN = " Paris";
/** The runner-up `buildLensData` always produces — the `secondToken` key. */
const RUN_SECOND_TOKEN = " the";

const unit = (u: TutorialUnit): TutorialUnit => u;

export const TUTORIAL_CHECK_CONTENT: TutorialContent = {
    version: 1,
    // The tutorial-wide default. `u2` inherits it and `u3`/`u6` override it,
    // which is the whole precedence table exercised in one document.
    checkFeedback: "verdict",
    welcome: {
        slides: [
            {
                title: "Reading a logit lens",
                body: "Each row is a token position and each column is a layer.",
            },
        ],
        tourCta: "Show me the controls",
    },
    glossary: [{ term: "Layer", definition: "One block of the transformer." }],
    units: [
        unit({
            id: "u0-top1",
            kind: "lens",
            title: "The top prediction",
            task: "Look at the bottom-right cell of the heatmap.",
            concept: "The final layer's top-1 token is what the model would say next.",
            prompts: ["The Eiffel Tower is in the city of"],
            hints: [{ stage: 1, text: "Bottom row, right-hand end." }],
            check: {
                kind: "choice",
                feedback: "verdict",
                question: "Which token does a heatmap cell show?",
                // Two options that read almost identically. A grader that matched
                // on the label instead of the index would be a coin flip here.
                options: [
                    "The token with the highest probability",
                    "The token with the lowest probability",
                ],
                correctIndex: 0,
            },
            observationPrompt: "What did you notice about the bottom-right cell?",
            progression: { on: "manual" },
        }),
        unit({
            id: "u1-layer",
            kind: "lens",
            title: "Where the answer settles",
            task: "Follow one row from left to right.",
            concept: "A prediction can appear early and then change.",
            prompts: ["The capital of Italy is"],
            hints: [{ stage: 1, text: "Compare the left-hand and right-hand ends." }],
            check: {
                kind: "choice",
                feedback: "verdict",
                question: "Which layer holds the model's actual output?",
                // Key 2 of 4: a hardcoded zero scores "Layer 0" as correct.
                options: ["Layer 0", "Layer 1", "The final layer", "No layer at all"],
                correctIndex: 2,
            },
            observationPrompt: "Where did the answer settle along the row?",
            progression: { on: "manual" },
        }),
        unit({
            id: "u2-inherit",
            kind: "explore",
            title: "Inherited feedback",
            task: "Answer without looking anything up.",
            concept: "This check sets no feedback of its own.",
            prompts: ["Rome is the capital of"],
            hints: [{ stage: 1, text: "Only one of these describes patching." }],
            // No `feedback` key: resolves to the tutorial's "verdict".
            check: {
                kind: "choice",
                question: "What does activation patching do?",
                options: [
                    "It rewrites the prompt before the model reads it",
                    "It copies one run's internal state into another run",
                ],
                correctIndex: 1,
            },
            observationPrompt: "What do you expect patching to change?",
            progression: { on: "manual" },
        }),
        unit({
            id: "u3-neutral",
            kind: "explore",
            title: "Quiet check",
            task: "Answer however you like.",
            concept: "Some questions have no single right answer worth insisting on.",
            prompts: ["Berlin is the capital of"],
            hints: [{ stage: 1, text: "Either answer is defensible." }],
            check: {
                kind: "choice",
                // Overrides the tutorial's "verdict": nothing about right or
                // wrong may reach the screen for this one.
                feedback: "neutral",
                question: "Is the top-1 token always the best answer?",
                options: ["Yes, always", "No, not always"],
                correctIndex: 0,
            },
            observationPrompt: "Why might the top-1 token be misleading?",
            progression: { on: "manual" },
        }),
        unit({
            id: "u4-run-top",
            kind: "lens",
            title: "Your own run",
            task: "Run the prompt, then read off the final prediction.",
            concept: "The check is scored against the run you just made.",
            prompts: ["The Eiffel Tower is in the city of"],
            hints: [{ stage: 1, text: "Bottom-right cell again." }],
            check: {
                kind: "topToken",
                feedback: "verdict",
                question: "What was the model's top prediction?",
            },
            answerPlaceholder: "Type the token",
            observationPrompt: "What was the top prediction on your run?",
            progression: { on: "run" },
        }),
        unit({
            id: "u5-run-second",
            kind: "lens",
            title: "The runner-up",
            task: "Run the prompt, then find the second-ranked token.",
            concept: "The model ranks every token, not just the winner.",
            prompts: ["The Colosseum is in the city of"],
            hints: [{ stage: 1, text: "Click the final cell to see its ranking." }],
            check: {
                kind: "secondToken",
                feedback: "verdict",
                question: "What was the second-ranked prediction?",
            },
            answerPlaceholder: "Type the token",
            observationPrompt: "What was the runner-up on your run?",
            progression: { on: "run" },
        }),
        unit({
            id: "u6-run-neutral",
            kind: "lens",
            title: "Quiet typed check",
            task: "Run the prompt, then type what you saw.",
            concept: "A token you can see but cannot type is not a fair question.",
            prompts: ["The Pantheon is in the city of"],
            hints: [{ stage: 1, text: "Type it however it reads." }],
            check: {
                kind: "topToken",
                // Typed + neutral, so the submit button reads "Submit".
                feedback: "neutral",
                question: "Which token did you read off the final cell?",
            },
            answerPlaceholder: "Type the token",
            observationPrompt: "Was the token typable as it appeared?",
            progression: { on: "run" },
        }),
        unit({
            id: "u7-wrap",
            kind: "challenge",
            title: "That's the tour",
            task: "Nothing left to do.",
            concept: "Reaching the end is what finishes the activity.",
            prompts: ["The Sagrada Familia is in the city of"],
            hints: [{ stage: 1, text: "You're done." }],
            // Manual + last, so `markReached` completes it on arrival and the
            // completion recap (with the notes) renders.
            observationPrompt: "Anything else you noticed?",
            progression: { on: "manual" },
        }),
    ],
};

export const TOTAL_UNITS = TUTORIAL_CHECK_CONTENT.units.length;

/** Locate a unit by id, so the spec never hardcodes an array index. */
export const unitIndex = (id: string): number => {
    const idx = TUTORIAL_CHECK_CONTENT.units.findIndex((u) => u.id === id);
    if (idx < 0) throw new Error(`No such unit in the check fixture: ${id}`);
    return idx;
};

/**
 * One row per check, with everything a generated test needs: where the unit is,
 * how to answer it right and wrong, and the key the panel will quote back.
 *
 * `expectedKey` is what appears inside the curly quotes of a verdict message —
 * the raw token for a run-scored check (leading space and all, which is exactly
 * why a participant typing "Paris" still scores correct: `normalizeAnswer`
 * strips a *leading* marker), or the option label for a choice.
 */
export interface CheckCase {
    unitId: string;
    unitIdx: number;
    /** The check's question — the accessible name of its group / input. */
    question: string;
    kind: "choice" | "topToken" | "secondToken";
    /** What the panel resolves this check's feedback to. */
    feedback: "verdict" | "neutral";
    /** Run-scored checks stay closed until this unit has its own lens run. */
    needsRun: boolean;
    /** An answer that must score correct. */
    correctAnswer: string;
    /** An answer that must score incorrect. */
    wrongAnswer: string;
    /** The key the verdict quotes when the answer is wrong. */
    expectedKey: string;
}

const choiceCase = (
    unitId: string,
    correctIdx: number,
    wrongIdx: number,
    feedback: "verdict" | "neutral",
): CheckCase => {
    const idx = unitIndex(unitId);
    const check = TUTORIAL_CHECK_CONTENT.units[idx].check;
    if (!check || check.kind !== "choice") throw new Error(`${unitId} is not a choice check`);
    return {
        unitId,
        unitIdx: idx,
        question: check.question,
        kind: "choice",
        feedback,
        needsRun: false,
        correctAnswer: check.options[correctIdx],
        wrongAnswer: check.options[wrongIdx],
        expectedKey: check.options[check.correctIndex],
    };
};

const typedCase = (unitId: string, key: string, feedback: "verdict" | "neutral"): CheckCase => {
    const idx = unitIndex(unitId);
    const check = TUTORIAL_CHECK_CONTENT.units[idx].check;
    if (!check || check.kind === "choice") throw new Error(`${unitId} is not a typed check`);
    return {
        unitId,
        unitIdx: idx,
        question: check.question,
        kind: check.kind,
        feedback,
        needsRun: true,
        // Typed without the leading space, which is the whole point of
        // `normalizeAnswer`: a participant cannot type a space marker.
        correctAnswer: key.trim(),
        wrongAnswer: "definitelynotthetoken",
        expectedKey: key,
    };
};

export const CHECK_CASES: CheckCase[] = [
    choiceCase("u0-top1", 0, 1, "verdict"),
    choiceCase("u1-layer", 2, 0, "verdict"),
    choiceCase("u2-inherit", 1, 0, "verdict"),
    choiceCase("u3-neutral", 0, 1, "neutral"),
    typedCase("u4-run-top", RUN_TOP_TOKEN, "verdict"),
    typedCase("u5-run-second", RUN_SECOND_TOKEN, "verdict"),
    typedCase("u6-run-neutral", RUN_TOP_TOKEN, "neutral"),
];
