import config from "@/lib/config";
import type { LensConfigData } from "@/types/lens";
import type { Model, Token } from "@/types/models";
import { startAndPoll } from "../startAndPoll";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useWorkspace } from "@/stores/useWorkspace";
import { createUserHeadersAction } from "@/actions/auth";

interface Prediction {
    idx: number;
    ids: number[];
    probs: number[];
    texts: string[];
}

const getPrediction = async (request: LensConfigData): Promise<Prediction> => {
    const headers = await createUserHeadersAction();
    return await startAndPoll<Prediction>(
        config.endpoints.startPrediction,
        request,
        config.endpoints.resultsPrediction,
        headers,
    );
};

export const usePrediction = () => {
    return useMutation({
        mutationFn: getPrediction,
        onError: (error, variables, context) => {
            toast.error(`Error: ${error}`);
        },
    });
};

interface Completion {
    prompt: string;
    max_new_tokens: number;
    model: string;
}

export interface GenerationResponse {
    completion: Token[];
    last_token_prediction: Prediction;
}

const generate = async (request: Completion): Promise<GenerationResponse> => {
    const headers = await createUserHeadersAction();
    return await startAndPoll<GenerationResponse>(
        config.endpoints.startGenerate,
        request,
        config.endpoints.resultsGenerate,
        headers,
    );
};

export const useGenerate = () => {
    return useMutation({
        mutationFn: generate,
        onError: (error, variables, context) => {
            toast.error(`Error: ${error}`);
        },
    });
};

export interface ModelsResponse {
    [toolName: string]: Model[];
}

export const getModels = async (): Promise<ModelsResponse> => {
    const headers = await createUserHeadersAction();
    const response = await fetch(config.getApiUrl(config.endpoints.models), {
        headers: {
            "Content-Type": "application/json",
            ...headers,
        },
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
};

// Helper function to get models for a specific tool
export const getModelsForTool = (modelsResponse: ModelsResponse, toolName: string): Model[] => {
    return modelsResponse[toolName] || [];
};

// Helper function to get all models across all tools (union)
export const getAllModels = (modelsResponse: ModelsResponse): Model[] => {
    const modelMap = new Map<string, Model>();
    
    Object.values(modelsResponse).forEach(models => {
        models.forEach(model => {
            // Use model name as key to deduplicate
            if (!modelMap.has(model.name)) {
                modelMap.set(model.name, model);
            }
        });
    });
    
    return Array.from(modelMap.values());
};
