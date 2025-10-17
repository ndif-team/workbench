import config from "@/lib/config";
import type { LensConfig } from "@/types/lens";
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

const getPrediction = async (request: LensConfig): Promise<Prediction> => {
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

export const getModels = async (): Promise<Model[]> => {
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
