export interface Token {
    // Index of the token in the prompt
    idx: number;
    id: number;
    text: string;
}

export type ModelStatus =
    | "hot"
    | "warm"
    | "deploying"
    | "cold"
    | "gated"
    | "unavailable"
    | "unknown";

export interface Model {
    name: string;
    is_chat: boolean;
    n_layers: number;
    params: string;
    gated: boolean;
    allowed: boolean;
    /** Optional warmth/availability hint from NDIF. Falls back to `allowed`/`gated`. */
    status?: ModelStatus;
    /** Whether a Jacobian lens checkpoint exists for this model, i.e. whether
     * the j-lens tool can run against it. Stamped by the backend /models route. */
    has_jacobian?: boolean;
    /** Whether it is a looped model: its tools count layer visits. */
    looped?: boolean;
    /** The options each tool takes on this model beyond its own parameters,
     * by tool type; a tool that takes none is absent. Read them with
     * `ToolOptions.of`. Stamped by the backend /models route from what
     * nnsightful declares. */
    tool_options?: Partial<Record<string, ToolOption[]>>;
    /** The account that publishes it, or null while the backend hasn't been
     * able to look it up. */
    org?: ModelOrg | null;
}

/** One value a tool option takes (nnsightful's `ToolChoice`). */
export interface ToolChoice {
    value: string;
    /** What a control calls it. */
    label: string;
    /** What a run does with it, for a tooltip or a note. */
    description: string;
}

/** An option a tool takes on a model: a named argument of its run with a few
 * values to pick from (nnsightful's `ToolOption`). */
export interface ToolOption {
    /** The argument's name, which a config and a run carry the pick under. */
    name: string;
    label: string;
    /** The values it takes, in the order they are offered. */
    choices: ToolChoice[];
    /** The value a run without a pick uses. */
    default: string;
}

/** The value picked for each of a tool's options, by option name. */
export type ToolOptionValues = Record<string, string>;

/** The account a model is published under (the backend's `OrgMetadata`). */
export interface ModelOrg {
    /** The account's ID, the first part of its models' names. */
    name: string;
    /** The logo its organization uploaded to Hugging Face; null for a
     * person's account or an organization without one. */
    avatar_url: string | null;
}
