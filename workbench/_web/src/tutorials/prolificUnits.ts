import { TUTORIAL_STEP_IDS, type TutorialStepId } from "./prolificSteps";

/**
 * The 7-unit Prolific Patch Lens tutorial (spec §3), authored as data consumed
 * by the companion TutorialActivityPanel. Each unit turns a facilitator move
 * from the Jul-16 pilot into an unattended feature: a task, a concept callout,
 * a known-good prompt bank, a hint ladder, an embedded check, and an
 * observation box.
 *
 * Embedded checks are auto-scored against the participant's OWN run result
 * (greedy decoding is deterministic), so they need no hardcoded answer keys and
 * stay correct across models. They are log-only and never gate progress (§4.7).
 */

export type UnitKind = "lens" | "patch" | "explore" | "challenge";

/** A hint ladder rung (§4.3): nudge → concrete suggestion → show-me. */
export interface HintRung {
    // 1 = nudge, 2 = concrete suggestion, 3 = show-me (may insert a prompt).
    stage: number;
    text: string;
    // For the show-me rung: a prompt to insert on reveal.
    insertPrompt?: string;
}

/** An embedded engagement check (§4.7), auto-scored against the run result. */
export interface UnitCheck {
    question: string;
    // Which facet of the run result the answer is compared against.
    kind: "topToken" | "secondToken" | "layerBand";
    // For layerBand checks, the acceptable answers (early/middle/late) — scored
    // loosely since "where did it emerge" is approximate.
    layerOptions?: string[];
}

export interface TutorialUnit {
    id: TutorialStepId;
    index: number;
    kind: UnitKind;
    title: string;
    // The task the participant performs.
    task: string;
    // The concept callout — the facilitator sentence it replaces.
    concept: string;
    // Known-good completion prompts (insert-on-click). Pre-verified against the
    // workshop model; first entry is the default.
    prompts: string[];
    // For patch units, a source/target pair to preload.
    patchPair?: { source: string; target: string };
    hints: HintRung[];
    check?: UnitCheck;
    // The reflective prompt for the observation box (§4.4).
    observationPrompt: string;
    // Optional expandable FAQ asides (§4.6).
    faqs?: { q: string; a: string }[];
    // True when this unit's task is satisfied by a plain run (most lens units);
    // unit 3 overrides progression with a predicate below.
    optional?: boolean;
}

// Unit 3's progression predicate: the participant must get the model to answer
// a math prompt with something OTHER than the correct sum, by prepending
// wrong-pattern few-shot examples. Success = top token is not the true answer.
// Scored on the participant's run in the panel; kept here so it lives with the
// unit. `topToken` is the model's greedy next-token (may carry a leading space).
export const unit3SuccessPredicate = (topToken: string | null): boolean => {
    if (!topToken) return false;
    const t = topToken.trim();
    // The true answer to 5+5; success is making the model say anything else.
    return t !== "10";
};

export const TUTORIAL_UNITS: TutorialUnit[] = [
    {
        id: TUTORIAL_STEP_IDS.orientation,
        index: 0,
        kind: "lens",
        title: "Orientation",
        task: "Run the starter prompt and read the heatmap. Each row is a position in your prompt; each column is a layer; each cell is the model's top guess there.",
        concept:
            "The model predicts just the NEXT token. To get more, append the prediction to your prompt and run again — it doesn't write whole answers at once.",
        prompts: ["The Eiffel Tower is in the city of"],
        hints: [
            {
                stage: 1,
                text: "Click Run, then look at the last row — that's the model's prediction for the next word.",
            },
            {
                stage: 2,
                text: "The rightmost column is the final layer. Read the bottom-right cell: that's the model's actual next-token guess.",
            },
            {
                stage: 3,
                text: "Try this exact prompt and click Run.",
                insertPrompt: "The Eiffel Tower is in the city of",
            },
        ],
        check: {
            question: "What single token did the model predict comes next?",
            kind: "topToken",
        },
        observationPrompt:
            "What did the model predict? Did anything about the heatmap surprise you?",
        faqs: [
            {
                q: "Does it remember me between prompts?",
                a: "No. The model sees only the text in the current prompt — nothing about you or past prompts carries over.",
            },
        ],
    },
    {
        id: TUTORIAL_STEP_IDS.whereAnswersComeFrom,
        index: 1,
        kind: "lens",
        title: "Where answers come from",
        task: "Run an opinion/recall prompt and inspect the final-layer prediction. Then look at the runner-up token in the side panel.",
        concept:
            "It didn't look this up. It generated the most likely token from patterns in its 2023 training data — there's a runner-up it also considered.",
        // Verified on Llama-3.1-70B-Instruct: → Everest / Jupiter / Neil.
        prompts: [
            "The tallest mountain in the world is Mount",
            "The largest planet in the solar system is",
            "The first person to walk on the moon was",
        ],
        hints: [
            {
                stage: 1,
                text: "Run the prompt, then click the bottom-right cell to open the top predictions panel.",
            },
            {
                stage: 2,
                text: "The side panel lists the top-k tokens by probability. The second row is the runner-up.",
            },
            {
                stage: 3,
                text: "Try this prompt and open its top predictions.",
                insertPrompt: "The tallest mountain in the world is Mount",
            },
        ],
        check: { question: "What was the model's SECOND-ranked next token?", kind: "secondToken" },
        observationPrompt:
            "What was the top answer, and what was the runner-up? Would a person have answered the same way?",
    },
    {
        id: TUTORIAL_STEP_IDS.whatModelKnows,
        index: 2,
        kind: "lens",
        title: "What the model knows",
        task: "Run a prompt that refers to something said 'earlier' that isn't actually in the prompt. Watch it fail — it has nothing to recall.",
        concept:
            "When you run this prompt, the model knows ONLY (1) what Meta pre-trained it on in 2023 and (2) what is in this prompt — NOTHING ELSE.",
        // Verified on Llama-3.1-70B-Instruct: → blue / pizza (the model invents a
        // plausible answer it has no way of knowing — the point of this unit).
        prompts: [
            "As I mentioned earlier, my favorite color is",
            "As I mentioned earlier, my favorite food is",
        ],
        hints: [
            {
                stage: 1,
                text: "There is no 'earlier' — the model can only guess. Notice it makes something up.",
            },
            {
                stage: 2,
                text: "Compare this to a prompt that contains the fact. The model can only use what's written here.",
            },
            {
                stage: 3,
                text: "Try this and see what it invents.",
                insertPrompt: "As I mentioned earlier, my favorite color is",
            },
        ],
        check: {
            question: "What did the model guess for the 'remembered' detail it never actually saw?",
            kind: "topToken",
        },
        observationPrompt: "The model had no way to know the answer. What did it do instead?",
        faqs: [
            {
                q: "Does it keep learning from what I type?",
                a: "No — its weights were frozen after 2023 pre-training. It 'graduated' and no longer learns; your prompt only fills its short-term context.",
            },
        ],
    },
    {
        id: TUTORIAL_STEP_IDS.patternsBeatFacts,
        index: 3,
        kind: "lens",
        title: "Patterns beat facts",
        task: "Get the model to answer 5+5 with something other than 10. Prepend a few wrong-pattern examples, then run. Watch the upper layers grow confident in the wrong answer.",
        concept:
            "You didn't teach it that math is different — you filled its context with a pattern. A fresh start clears it.",
        prompts: ["2+2=5\n3+3=7\n4+4=9\n5+5=", "1+1=3\n2+2=5\n3+3=7\n5+5="],
        hints: [
            {
                stage: 1,
                text: "What pattern do your example lines show? The model copies patterns more than it 'does math'.",
            },
            {
                stage: 2,
                text: "Add two or three example lines where each sum is wrong by the same amount, e.g. '3+3=7', then end with '5+5='.",
            },
            {
                stage: 3,
                text: "Try this exact few-shot prompt.",
                insertPrompt: "2+2=5\n3+3=7\n4+4=9\n5+5=",
            },
        ],
        check: {
            question: "After your few-shot examples, what did the model predict for 5+5?",
            kind: "topToken",
        },
        observationPrompt:
            "What made the model give a wrong sum? What happened across the layers as it 'committed' to it?",
        optional: false,
    },
    {
        id: TUTORIAL_STEP_IDS.moveAThought,
        index: 4,
        kind: "patch",
        title: "Move a thought",
        task: "Run the source/target pair, then DRAG a cell from the source heatmap onto the target heatmap to patch its internal state. Watch the target's output flip.",
        concept:
            "Information lives in specific places inside the model — you can find where by intervening and watching what changes downstream.",
        prompts: ["The Eiffel Tower is in the city of"],
        patchPair: {
            source: "The Eiffel Tower is in the city of",
            target: "The Colosseum is in the city of",
        },
        hints: [
            {
                stage: 1,
                text: "First click Run to compute both heatmaps, then drag a source cell onto a target cell.",
            },
            {
                stage: 2,
                text: "Drag from a late-layer cell on the source's last row onto the same position in the target, then read the new result heatmap.",
            },
            {
                stage: 3,
                text: "Load the example pair and run it, then drag a late-layer source cell onto the target.",
                insertPrompt: "The Eiffel Tower is in the city of",
            },
        ],
        check: {
            question: "After the patch, what token did the TARGET prompt produce?",
            kind: "topToken",
        },
        observationPrompt: "Which cell did you patch, and how did the target's prediction change?",
    },
    {
        id: TUTORIAL_STEP_IDS.explore,
        index: 5,
        kind: "explore",
        title: "Explore",
        task: "Free exploration — try your own prompts. Phrase them so the answer is the very next word.",
        concept:
            "Phrase your prompt so the answer is the very next word. If the model predicts punctuation or a newline, it thinks the text is already complete — rephrase.",
        // Verified on Llama-3.1-70B-Instruct: → Au / cold / Pacific.
        prompts: [
            "The chemical symbol for gold is",
            "The opposite of hot is",
            "The largest ocean on Earth is the",
        ],
        hints: [
            {
                stage: 1,
                text: "End your prompt right before the answer, e.g. '… is' or '… the answer is'.",
            },
        ],
        observationPrompt:
            "What did you try? What was the most surprising thing you saw inside the model?",
        optional: true,
    },
    {
        id: TUTORIAL_STEP_IDS.finalChallenge,
        index: 6,
        kind: "challenge",
        title: "Final challenge",
        task: "Find a prompt where the model is confidently wrong. Run it, then describe what you saw across the layers.",
        concept:
            "You've seen the model predict next tokens, reveal runner-ups, forget things it never knew, and follow patterns over facts. Now put it to the test.",
        prompts: [],
        hints: [
            {
                stage: 1,
                text: "Confidently-wrong is easiest with obscure facts or misleading patterns — try a tricky trivia prompt or a few-shot trap.",
            },
        ],
        observationPrompt:
            "Paste the prompt you found and describe what you saw across the layers. Where did the model 'commit' to the wrong answer?",
    },
];

export const getUnit = (index: number): TutorialUnit | undefined => TUTORIAL_UNITS[index];
