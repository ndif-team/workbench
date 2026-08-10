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

interface OrientationTourOptions {
    /**
     * Whether the tutorial has its own column (desktop). Without it (mobile) the
     * closing step's selector would not exist, and reactour centres an unresolvable
     * selector's popover over the page with an empty highlight.
     */
    docked: boolean;
}

/** No mask, for the steps that talk about the layout rather than one control. */
const noMask = { maskArea: (base: Record<string, unknown>) => ({ ...base, display: "none" }) };

/** The display mounts async (skeleton → widget) and grows as cells animate in. */
const watchDisplay = {
    mutationObservables: ["#patch-lens-display"],
    resizeObservables: ["#patch-lens-display"],
};

export function orientationTourSteps({ docked }: OrientationTourOptions): ExtendedStepType[] {
    const steps: ExtendedStepType[] = [
        {
            selector: "#patch-lens-source-prompt",
            stepId: "tour-prompt",
            content:
                "Your text goes here, and a prompt is loaded already: `The Eiffel Tower is in the city of`.\n\nIt isn't shown as words. The model reads in chunks called tokens, which don't line up with words — 'Eiffel' alone takes three. You're seeing the prompt the way the model gets it.\n\nIt stops just before the answer on purpose. The model only ever predicts one more token, so the answer has to be whatever comes next.",
        },
        {
            selector: "#patch-lens-run",
            stepId: "tour-run",
            content:
                "Click Run Patch Lens. It takes a few seconds. The model runs on a shared research cluster, so you might wait in a short queue.",
            // Wait for the run to finish, not just the click: the next step talks
            // about a heatmap, and advancing on the click would point at a skeleton.
            trigger: { type: "runCompleted" },
        },
        {
            selector: "#patch-lens-display",
            stepId: "tour-heatmap",
            content:
                "Here's what came back. Each row is one token of your text, in the order you typed them. Each column is one layer, earliest on the left, last on the right.\n\nAny cell is what the model would have said next if it had stopped thinking at that layer.",
            ...watchDisplay,
        },
        {
            selector: "#patch-lens-display",
            stepId: "tour-answer-cell",
            content:
                "The cell to watch is the bottom-right one, at the last position and the last layer. That's the model's real answer, and every question in this tutorial asks about it.\n\nSome cells show `␣` or `↵`. Those are a space and a line break, and they're real predictions. Whitespace is a token the model ranks like anything else. The key under the grid tells you which marks are on screen.",
            ...watchDisplay,
        },
        {
            selector: "#patch-lens-display",
            stepId: "tour-topk",
            content:
                "Click the bottom-right cell to see what else was in the running. A panel opens with the model's top guesses in order, and how sure it was about each one.\n\nThe second row is the runner-up, the answer it nearly gave instead.",
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
                "If token, layer, position or cell stops making sense, they're all in here, with a labelled picture of the heatmap. This button is on every step, not just this one.",
            mutationObservables: ["#tutorial-glossary"],
        },
    ];

    if (docked) {
        steps.push({
            selector: "#tutorial-dock",
            stepId: "tour-panel",
            content:
                "The rest happens in this column. Each step gives you one thing to do, says why it matters, offers a hint if you get stuck, and ends with a box for what you noticed.\n\nThat's the tour. Step 1 asks you to read the answer you just ran.",
            styles: noMask,
            mutationObservables: ["#tutorial-dock"],
        });
    } else {
        steps.push({
            selector: "#patch-lens-welcome",
            stepId: "tour-panel",
            content:
                "The rest happens in the tutorial panel. Each step gives you one thing to do, says why it matters, offers a hint if you get stuck, and ends with a box for what you noticed.\n\nThat's the tour. Step 1 asks you to read the answer you just ran.",
            styles: noMask,
        });
    }

    return steps;
}
