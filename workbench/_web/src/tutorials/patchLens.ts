import type { ExtendedStepType, TutorialChapterProgress, TutorialProgress } from "@/types/tutorial";

/**
 * Tutorial for the CM (causal mediation / activation patching) intro feature.
 *
 * Selector ids must be present in PatchLensArea.tsx and PatchLensDisplay.tsx.
 */
const PatchLensSteps: ExtendedStepType[] = [
    {
        selector: "#patch-lens-welcome",
        content:
            "Welcome to activation patching.\n\nThis tool lets you take a piece of internal state from one prompt's forward pass and inject it into another prompt's forward pass at the same layer and position. By watching what changes downstream, you can locate the parts of the model that 'carry' a particular piece of information.",
        styles: {
            maskArea: (base) => ({ ...base, display: "none" }),
        },
    },
    {
        selector: "#patch-lens-source-prompt",
        content:
            "Start with a Source prompt — the prompt whose internal state you want to STEAL from. Pick something that produces a clear, specific prediction (e.g. 'The Eiffel Tower is in the city of').",
    },
    {
        selector: "#patch-lens-target-prompt",
        content:
            "Add a Target prompt — the prompt whose forward pass you'll PATCH INTO. Typically you pick something with similar grammar but a different answer (e.g. 'The Big Ben is in the city of'), so any change in the target's prediction tells you that the patched activation carried the answer.\n\nYou can leave Target blank to use Patch Lens as a single-prompt lens viewer.",
    },
    {
        selector: "#patch-lens-run",
        content: "Click Run to compute the logit lens for both prompts.",
        trigger: {
            type: "click",
            target: "#patch-lens-run",
        },
    },
    {
        selector: "#patch-lens-display",
        content:
            "You now see two heatmaps, one per prompt. Same axes as the lens: rows are token positions, columns are layers. Click any cell to see a crosshair + the 'About this view' legend in the side panel.",
    },
    {
        selector: "#patch-lens-display",
        content:
            "To run an intervention, DRAG a cell from the Source heatmap and DROP it on a cell in the Target heatmap. Workbench will:\n\n  1. Run the Source prompt and capture the residual stream at the cell you dragged.\n  2. Run the Target prompt, but overwrite the residual stream at the drop position with the captured Source value.\n  3. Show you the Target's NEW per-layer predictions in a third heatmap below.",
    },
    {
        selector: "#patch-lens-display",
        content:
            "Reading the result heatmap: compare it to the original Target heatmap. Any cell that CHANGED means the patched activation influenced that downstream computation. Cells that stayed the same were unaffected — that part of the network ignored the swap.\n\nThe pattern of changes tells you where in the model the patched information is being read by later layers.",
    },
    {
        selector: "#patch-lens-display",
        content:
            "A classic experimental design: pick a Source and Target that differ in ONE controlled way (e.g. 'Paris' vs 'London' as the answer). Then patch one layer at a time. The earliest layer where patching flips the Target's prediction to the Source's answer tells you where that fact is 'stored' in the residual stream.\n\nThis is the basic recipe for causal mediation analysis.",
    },
];

const PatchLensChapters: TutorialChapterProgress[] = [
    {
        title: "Getting started",
        steps: PatchLensSteps,
        completed: false,
    },
];

export const PatchLensTutorial: TutorialProgress = {
    chapters: PatchLensChapters,
    currentChapter: 0,
    description:
        "A walkthrough of Patch Lens (causal mediation / activation patching). Learn how to set up source and target prompts, run an intervention by dragging a cell from one heatmap to another, and interpret the resulting changes.",
};
