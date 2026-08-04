export interface Token {
    // Index of the token in the prompt
    idx: number;
    id: number;
    text: string;
    targetIds: number[];
}

export interface TokenOption {
    value: number; // token id
    text: string; // token text
    prob?: number; // probability
}

export interface Prediction {
    // Index of the token in the prompt
    idx: number;
    ids: number[];
    probs: number[];
    texts: string[];
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
}
