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

export interface GenerationItem {
    id: string;
    createdAt: number;
    model: string;
    prompt: string;
    params: GenerationParams;
    status: GenerationStatus;
    output?: string;
    promptTokens?: number;
    outputTokens?: number;
    error?: string;
}
