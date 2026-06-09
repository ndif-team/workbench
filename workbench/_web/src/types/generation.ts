export interface GenerationParams {
    maxNewTokens: number;
    temperature: number;
    topP: number;
    topK: number;
    stopSequences: string[];
    sampling: boolean;
}

export const DEFAULT_GENERATION_PARAMS: GenerationParams = {
    maxNewTokens: 64,
    temperature: 0.8,
    topP: 0.95,
    topK: 50,
    stopSequences: [],
    sampling: true,
};

export type GenerationStatus = "pending" | "success" | "error";

/** Panel-wide reading mode for completions. */
export type GenerationViewMode = "text" | "tokens";

export interface GenerationItem {
    id: string;
    createdAt: number;
    model: string;
    prompt: string;
    params: GenerationParams;
    status: GenerationStatus;
    output?: string;
    outputTokens?: number;
    /** Real per-token text of the prompt (the seed), captured at generation time
     * (tokenized in parallel) so token view renders it without a tokenize call.
     * Optional/additive — older items lack it. */
    seedTokens?: string[];
    /** Real per-token text of the model's completion. */
    completionTokens?: string[];
    error?: string;
}
