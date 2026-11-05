/**
 * Grids an algorithm can be placed on, the abstract tokenizer, and defaults.
 */

import {
    ALGORITHM_SCHEMA_ID,
    type AlgorithmDefinition,
    type AlgorithmGrid,
    type AlgorithmView,
} from "@/types/algorithmHypothesis";

interface GridOption {
    id: string;
    label: string;
    grid: AlgorithmGrid;
}

/** Abstract grids are for sketching; model grids use the model's tokenizer and
 * layer count, so the grid lines up with Patch Lens. Algorithms only: nothing
 * here runs the model. */
export const GRID_OPTIONS: GridOption[] = [
    { id: "abstract-8", label: "Abstract · 8 layers", grid: { kind: "abstract", layers: 8 } },
    {
        id: "google/gemma-2-2b-it",
        label: "gemma-2-2b-it · 26 layers",
        grid: { kind: "model", layers: 26, model: "google/gemma-2-2b-it" },
    },
];

/** Ungated copies of gated tokenizers. Model grids use only the tokenizer, so
 * when the official one can't load (no HF_TOKEN with access), the grid
 * tokenizes with the copy, which serves the same tokenizer files. */
export const TOKENIZER_MIRRORS: Record<string, string> = {
    "google/gemma-2-2b-it": "unsloth/gemma-2-2b-it",
};

export function gridOptionId(grid: AlgorithmGrid): string {
    if (grid.kind === "model" && grid.model) return grid.model;
    return `abstract-${grid.layers}`;
}

export function gridLabel(grid: AlgorithmGrid): string {
    const known = GRID_OPTIONS.find((o) => o.id === gridOptionId(grid));
    if (known) return known.label;
    const name = grid.kind === "model" && grid.model ? grid.model.split("/").pop() : "Abstract";
    return `${name} · ${grid.layers} layers`;
}

/** Words and punctuation marks. Matches tokenize_abstract() in Python. */
export function tokenizeAbstract(text: string): string[] {
    return text.match(/[\p{L}\p{N}_']+|[^\s\p{L}\p{N}_']/gu) ?? [];
}

export const EXAMPLE_PROMPTS = [
    {
        label: "What does Tim love?",
        text: "Ann loves ale, Joe loves jam, Pete loves pie, Tim loves tea. What does Tim love?",
    },
    {
        label: "What does Ann love?",
        text: "Joe loves ale, Ann loves pie, Pete loves jam, Tim loves tea. What does Ann love?",
    },
    {
        label: "What does Ann love? (cod)",
        text: "Joe loves ale, Ann loves cod, Pete loves jam, Tim loves tea. What does Ann love?",
    },
];

export const DEFAULT_PROMPT = EXAMPLE_PROMPTS[0].text;

export const DEFAULT_VIEW: AlgorithmView = {
    layerStep: 1,
    focus: [],
    collapse: false,
    arrows: "nearby",
    labels: "values",
};

export function blankAlgorithm(
    name = "Untitled algorithm",
    template = DEFAULT_PROMPT,
): AlgorithmDefinition {
    return {
        schema: ALGORITHM_SCHEMA_ID,
        name,
        description: "",
        grid: { ...GRID_OPTIONS[0].grid },
        template,
        variables: [],
        output: null,
    };
}
