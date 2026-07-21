import { TUTORIAL_STEP_IDS } from "./prolificSteps";
import type { TutorialContent } from "@/types/tutorial-content";

/**
 * Seed content for the demo Prolific Patch Lens tutorial. This is the *seed
 * input* only — at runtime the tutorial is read from the `tutorials` DB table
 * (see lib/queries/tutorialContentDb.ts). The seed script inserts this as one
 * "Prolific Patch Lens (demo)" row; admins then edit copy in the workshop UI.
 *
 * Embedded checks are auto-scored against the participant's OWN run result
 * (greedy decoding is deterministic), so they need no answer keys and stay
 * correct across models. They are log-only and never gate progress.
 *
 * Progression is data-driven: most lens units complete on any run
 * (`successPredicate: always`); unit 3 completes only when the model is coaxed
 * off the true sum (`topTokenNotEqual: "10"`); the patch unit completes on an
 * applied intervention; explore/challenge never auto-complete.
 */

export const PROLIFIC_TUTORIAL_SLUG = "prolific-patch-lens-demo";
export const PROLIFIC_TUTORIAL_NAME = "Prolific Patch Lens (demo)";

export const PROLIFIC_TUTORIAL_SEED: TutorialContent = {
    version: 1,
    units: [
        {
            id: TUTORIAL_STEP_IDS.orientation,
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
            answerPlaceholder: "e.g. Paris",
            observationPrompt:
                "What did the model predict? Did anything about the heatmap surprise you?",
            observationPlaceholder: "What the model predicted, and anything that surprised you…",
            faqs: [
                {
                    q: "Does it remember me between prompts?",
                    a: "No. The model sees only the text in the current prompt — nothing about you or past prompts carries over.",
                },
            ],
            progression: { on: "run", successPredicate: { kind: "always" } },
        },
        {
            id: TUTORIAL_STEP_IDS.whereAnswersComeFrom,
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
            check: {
                question: "What was the model's SECOND-ranked next token?",
                kind: "secondToken",
            },
            answerPlaceholder: "the runner-up token",
            observationPrompt:
                "What was the top answer, and what was the runner-up? Would a person have answered the same way?",
            observationPlaceholder: "Top answer vs. runner-up, and whether a person would agree…",
            progression: { on: "run", successPredicate: { kind: "always" } },
        },
        {
            id: TUTORIAL_STEP_IDS.whatModelKnows,
            kind: "lens",
            title: "What the model knows",
            task: "Run a prompt that refers to something said 'earlier' that isn't actually in the prompt. Watch it fail — it has nothing to recall.",
            concept:
                "When you run this prompt, the model knows ONLY (1) what Meta pre-trained it on in 2023 and (2) what is in this prompt — NOTHING ELSE.",
            // Verified on Llama-3.1-70B-Instruct: → blue / pizza (the model invents
            // a plausible answer it has no way of knowing — the point of this unit).
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
                question:
                    "What did the model guess for the 'remembered' detail it never actually saw?",
                kind: "topToken",
            },
            answerPlaceholder: "the invented detail",
            observationPrompt: "The model had no way to know the answer. What did it do instead?",
            observationPlaceholder: "What the model did when it had nothing to recall…",
            faqs: [
                {
                    q: "Does it keep learning from what I type?",
                    a: "No — its weights were frozen after 2023 pre-training. It 'graduated' and no longer learns; your prompt only fills its short-term context.",
                },
            ],
            progression: { on: "run", successPredicate: { kind: "always" } },
        },
        {
            id: TUTORIAL_STEP_IDS.patternsBeatFacts,
            kind: "lens",
            title: "Patterns beat facts",
            task: "Get the model to answer 5+5 with something other than 10. Prepend a few wrong-pattern examples, then run. Watch the upper layers grow confident in the wrong answer.",
            concept:
                "You didn't teach it that math is different — you filled its context with a pattern. A fresh start clears it.",
            prompts: ["3+3=7\n4+4=9\n5+5=", "1+1=3\n2+2=5\n3+3=7\n5+5="],
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
                    insertPrompt: "3+3=7\n4+4=9\n5+5=",
                },
            ],
            check: {
                question: "After your few-shot examples, what did the model predict for 5+5?",
                kind: "topToken",
            },
            answerPlaceholder: "the model's answer to 5+5",
            observationPrompt:
                "What made the model give a wrong sum? What happened across the layers as it 'committed' to it?",
            observationPlaceholder: "Why it gave a wrong sum, and where it committed across layers…",
            progression: {
                on: "run",
                successPredicate: { kind: "topTokenNotEqual", value: "10" },
            },
        },
        {
            id: TUTORIAL_STEP_IDS.moveAThought,
            kind: "patch",
            title: "Move a thought",
            task: "First click a token in either heatmap to see its context highlight. Then run the source/target pair and DRAG a mid-layer cell from the source heatmap onto the target heatmap to patch its internal state. Watch the target's output flip.",
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
                    text: "Click a token first to see its context highlight. Then click Run to compute both heatmaps before you drag.",
                },
                {
                    stage: 2,
                    text: "Patch from a MIDDLE layer (around layer 20), not the last column — the final layer is too late to change the answer. Drag that source cell onto the same position in the target.",
                },
                {
                    stage: 3,
                    text: "Load the example pair, run it, then drag the highlighted mid-layer source cell onto the target's last row.",
                    insertPrompt: "The Eiffel Tower is in the city of",
                    spotlight: { grid: "source", layer: 20, position: "last" },
                },
            ],
            check: {
                question: "After the patch, what token did the TARGET prompt produce?",
                kind: "topToken",
            },
            answerPlaceholder: "the target's new prediction",
            observationPrompt:
                "Which cell did you patch, and how did the target's prediction change?",
            observationPlaceholder: "The cell you patched and how the target's prediction changed…",
            progression: { on: "patch" },
        },
        {
            id: TUTORIAL_STEP_IDS.explore,
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
            observationPlaceholder: "The prompt you tried and the most surprising thing you saw…",
            progression: { on: "manual" },
        },
        {
            id: TUTORIAL_STEP_IDS.finalChallenge,
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
            observationPlaceholder: "Your prompt, and where the model committed to the wrong answer…",
            progression: { on: "manual" },
        },
    ],
};
