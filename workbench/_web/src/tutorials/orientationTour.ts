import type { ExtendedStepType } from "@/types/tutorial";

/**
 * The walkthrough that follows the guided tutorial's welcome slideshow.
 *
 * The slideshow says what a language model does; this points at the six things a
 * participant has to be able to find, in the order they need them: the prompt box,
 * Run, the heatmap, the cell that holds the answer, the panel behind a cell click,
 * the glossary, and the step column that takes over afterwards.
 *
 * It is deliberately hands-on. Two of eight Workbench entrants in the pilot stalled
 * on step 1 inside three and a half minutes, and the worst-scoring SUS item for the
 * arm was "I needed to learn a lot of things before I could get going" — so the
 * walkthrough waits for the participant to click Run themselves (the run-completed
 * trigger) rather than narrating around a tool they haven't touched.
 *
 * The `#…` selectors live in PatchLensArea / PatchLensDisplay / TutorialGlossary /
 * TutorialDock, and `#patch-lens-topk` inside the edulogitlens widget's
 * TokenPredictionPanel. `stepId`s are prefixed `tour-` so tour telemetry never
 * collides with a tutorial unit id in `tutorial_events.stepId`.
 */

/** No mask, for the steps that talk about the layout rather than one control. */
const noMask = { maskArea: (base: Record<string, unknown>) => ({ ...base, display: "none" }) };

/** The display mounts async (skeleton → widget) and grows as cells animate in. */
const watchDisplay = {
    mutationObservables: ["#patch-lens-display"],
    resizeObservables: ["#patch-lens-display"],
};

/**
 * @param docked whether the tutorial has its own column (desktop). Without it
 * (mobile) the final step's selector would not exist, and reactour centres an
 * unresolvable selector's popover over the page with an empty highlight.
 */
export function orientationTourSteps({ docked }: { docked: boolean }): ExtendedStepType[] {
    const steps: ExtendedStepType[] = [
        {
            selector: "#patch-lens-source-prompt",
            stepId: "tour-prompt",
            content:
                "This is where your text goes. The first prompt is already loaded: `The Eiffel Tower is in the city of`.\n\nLook at how it's displayed: not as words, but split into boxed chunks called tokens — and they don't line up with words. 'Eiffel' alone is split into three. Tokens are the units the model actually reads and writes, so this is the text as the model sees it.\n\nNotice the prompt stops right before the answer. That is on purpose — the model only ever predicts the next token, so the answer has to come next.",
        },
        {
            selector: "#patch-lens-run",
            stepId: "tour-run",
            content:
                "Click Run Patch Lens. It takes a few seconds — the model runs on a shared research cluster, so there is a short queue.",
            // Wait for the run to finish, not just the click: the next step talks
            // about a heatmap, and advancing on the click would point at a skeleton.
            trigger: { type: "runCompleted" },
        },
        {
            selector: "#patch-lens-display",
            stepId: "tour-heatmap",
            content:
                "Here is the read-out. One row per token of your text, top to bottom in the order you typed them. One column per layer, earliest on the left, last on the right.\n\nEach cell is what the model would say next if it stopped thinking at that layer.",
            ...watchDisplay,
        },
        {
            selector: "#patch-lens-display",
            stepId: "tour-answer-cell",
            content:
                "The cell that matters most is the bottom-right one: last position, last layer. That is the model's actual answer.\n\nEvery question this tutorial asks you is about that cell.\n\nSome cells show a `␣` or a `↵`. Those are a space and a line break, and they are genuine predictions — whitespace is a token the model ranks like any other. The key under the grid names whichever marks are on screen.",
            ...watchDisplay,
        },
        {
            selector: "#patch-lens-display",
            stepId: "tour-topk",
            content:
                "Click the bottom-right cell to see the rest of the predictions. A panel opens with the model's top guesses, ranked, with how sure it was about each one.\n\nThe second row is the runner-up — the answer the model nearly gave instead.",
            // Invite the click on the grid, then take in the panel the moment it
            // mounts: it renders outside the display box and only after a cell click.
            highlightedSelectors: ["#patch-lens-display", "#patch-lens-topk"],
            mutationObservables: ["#patch-lens-display", "#patch-lens-topk"],
            resizeObservables: ["#patch-lens-display", "#patch-lens-topk"],
        },
        {
            selector: "#tutorial-glossary",
            stepId: "tour-glossary",
            content:
                "Token, layer, position, cell — if any word stops making sense, this button has all of them, plus a labelled picture of the heatmap. It is on every step, so you never have to scroll back to find a definition.",
            mutationObservables: ["#tutorial-glossary"],
        },
    ];

    if (docked) {
        steps.push({
            selector: "#tutorial-dock",
            stepId: "tour-panel",
            content:
                "Everything from here on happens in this column: one short task per step, why it matters, a hint if you get stuck, and a box for what you noticed.\n\nThat is the tour. Step 1 asks you to read the answer you just ran.",
            styles: noMask,
            mutationObservables: ["#tutorial-dock"],
        });
    } else {
        steps.push({
            selector: "#patch-lens-welcome",
            stepId: "tour-panel",
            content:
                "Everything from here on happens in the tutorial panel: one short task per step, why it matters, a hint if you get stuck, and a box for what you noticed.\n\nThat is the tour. Step 1 asks you to read the answer you just ran.",
            styles: noMask,
        });
    }

    return steps;
}
