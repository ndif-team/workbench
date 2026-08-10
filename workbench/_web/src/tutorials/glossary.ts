import type { GlossaryEntry } from "@/types/tutorial-content";

/**
 * The terms a Patch Lens tutorial uses, in the register the units are written in.
 * Used when a tutorial's content carries no `glossary` of its own.
 *
 * The tutorial introduces token, layer, position, cell, heatmap, source, target
 * and patch, each explained once in prose as it comes up — so a participant who
 * has forgotten "cell" by the time a later unit says "drag a cell" has nowhere to
 * look. This is that place; the panel keeps it reachable from every unit.
 */
export const DEFAULT_GLOSSARY: GlossaryEntry[] = [
    {
        term: "Token",
        definition:
            "A piece of text — usually a word, sometimes part of one, sometimes just a space or a comma. The model reads and writes one token at a time.",
    },
    {
        term: "Position",
        definition:
            "Where a token sits in your text. Each row of the heatmap is one position, in the order you typed them.",
    },
    {
        term: "Layer",
        definition:
            "One step of the model's computation. Your text passes through every layer in order, and the guess usually gets better the further it goes.",
    },
    {
        term: "Heatmap",
        definition:
            "The grid. One row per token of your text, one column per layer — earliest layer on the left, last on the right.",
    },
    {
        term: "Cell",
        definition:
            "One square of the heatmap: what the model would say next if it stopped at that layer, at that position.",
    },
    {
        term: "Bottom-right cell",
        definition:
            "The model's actual answer — the last position, after the last layer. When a question asks what the model predicted, read this one.",
    },
    {
        // The single most common "is it broken?" report: a cell showing ␣ or ↵
        // reads as the tool's own formatting rather than as something the model
        // chose. The grid carries a key for whichever marks are on screen; this is
        // the version that stays reachable from every step.
        term: "␣ and ↵ in a cell",
        definition:
            "A space and a line break. Whitespace is a token like any other, so the model predicts it like any other — these are real predictions, not formatting. A predicted line break means the model thinks the text is finished.",
    },
    {
        term: "Probability",
        definition:
            "How sure the model is about a guess, between 0 and 1. Stronger colour means more sure.",
    },
    {
        term: "Runner-up",
        definition: "The model's second choice for the next token, after its top one.",
    },
    {
        term: "Source prompt",
        definition: "The prompt you copy from — the first box, and the left heatmap.",
    },
    {
        term: "Target prompt",
        definition: "The prompt you copy into — the second box, and the right heatmap.",
    },
    {
        term: "Patch",
        definition:
            "Dragging one cell from the source heatmap onto the target, so the target carries on with that piece of the source's thinking. If the target's answer changes, that cell was carrying the answer.",
    },
];
