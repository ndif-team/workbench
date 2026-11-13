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
    /** The account that publishes it, or null while the backend hasn't been
     * able to look it up. */
    org?: ModelOrg | null;
}

/** The account a model is published under (the backend's `OrgMetadata`). */
export interface ModelOrg {
    /** The account's ID, the first part of its models' names. */
    name: string;
    /** The logo its organization uploaded to Hugging Face; null for a
     * person's account or an organization without one. */
    avatar_url: string | null;
}
