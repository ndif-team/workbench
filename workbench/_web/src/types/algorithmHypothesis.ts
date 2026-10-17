/**
 * Algorithm Hypothesis types.
 *
 * An algorithm is a set of typed variables placed on a layers × tokens grid.
 * The definition is schema v4 (`algorithm-hypothesis/v4`), shared with the
 * `algorithm_hypothesis` Python package that compiles it to causalab. Keep the
 * two in sync: the golden tests in lib/algorithmHypothesis/__tests__ check it.
 */

export const ALGORITHM_SCHEMA_ID = "algorithm-hypothesis/v4";

export type PrimitiveName =
    | "position_id"
    | "copy"
    | "pair"
    | "retrieve"
    | "index"
    | "key_of"
    | "value_of"
    | "mixture"
    | "constant";

/** A variable's type: string, int, position ID, or a key : value pair. */
export type VarType =
    | { kind: "string" }
    | { kind: "int" }
    | { kind: "position" }
    | { kind: "pair"; key: VarType; value: VarType };

/** A token of the prompt (by index) or another variable (by id). */
export type Ref = { token: number } | { variable: string };

/** A named argument holding one or more references. */
export interface Arg {
    name: string;
    refs: Ref[];
}

export type VariableFunction =
    | {
          kind: "primitive";
          name: PrimitiveName;
          options: Record<string, string | number>;
      }
    | {
          kind: "python";
          /** Defines `compute(<argument names>)`. */
          source: string;
      };

export interface Cell {
    layer: number;
    token: number;
}

export interface Variable {
    id: string;
    /** A Python identifier; unique within the algorithm. */
    name: string;
    cell: Cell;
    /** Inferred for primitives (null until the arguments are filled); declared
     * for Python functions. */
    type: VarType | null;
    function: VariableFunction;
    args: Arg[];
    /** Display only: a palette name ("indigo", …) or "#rrggbb". Absent: the
     * default, black (white in dark mode). */
    color?: string | null;
    /** Free-form labels, such as the algorithm a variable serves. */
    tags?: string[];
}

export interface AlgorithmGrid {
    kind: "abstract" | "model";
    layers: number;
    /** Hugging Face id, for model grids. */
    model?: string;
}

export interface AlgorithmDefinition {
    schema: typeof ALGORITHM_SCHEMA_ID;
    name: string;
    description: string;
    grid: AlgorithmGrid;
    /** The prompt the algorithm was placed on. Position IDs are read from it. */
    template: string;
    variables: Variable[];
    /** Id of the output variable (last layer, last token). */
    output: string | null;
    /** Saved prompts to run the algorithm on, e.g. sources and targets. */
    inputs?: string[];
    /** Positions of designated special tokens, such as names, in the
     * template. Position ID numbers them in order of first appearance. */
    specialTokens?: number[];
}

export type ArrowMode = "nearby" | "all" | "none";
export type ChipLabel = "values" | "names";

/** Per-chart view settings; never part of the algorithm. */
export interface AlgorithmView {
    layerStep: number;
    focus: number[];
    collapse: boolean;
    arrows: ArrowMode;
    labels: ChipLabel;
}

/** An interchange intervention from a source cell into a target cell, stored
 * with Patch Lens's fields. Layer -1 is the embedding row (the token itself). */
export interface InterventionSpec {
    sourceLayer: number;
    sourceToken: number;
    targetLayer: number;
    targetToken: number;
}

export type AlgorithmHypothesisMode = "edit" | "intervene" | "sweep";

/** The paper walkthrough: open, on which step, the steps done, and the
 * algorithms it loaded (example kind → algorithm id). */
export interface WalkthroughState {
    /** Which version of the walkthrough the progress belongs to. */
    version?: number;
    open: boolean;
    step: number;
    done?: string[];
    algorithms?: Record<string, string>;
}

/** Persisted into the chart row's `data` when `type = "algorithm-hypothesis"`. */
export interface AlgorithmHypothesisChartData {
    algorithmId: string;
    prompt: string;
    view?: Partial<AlgorithmView>;
    mode?: AlgorithmHypothesisMode;
    /** The intervention view's inputs and its last intervention. */
    intervention?: {
        source: string;
        target: string;
        spec: InterventionSpec | null;
    };
    /** The sweep view's inputs, the swept position (the same in both), and
     * whether it sweeps every position at once. */
    sweep?: {
        source: string;
        target: string;
        token: number | null;
        full: boolean;
    };
    walkthrough?: WalkthroughState;
}
