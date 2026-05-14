import { useEffect } from "react";
import config from "@/lib/config";
import type { LensConfigData } from "@/types/lens";
import type { Model, Token } from "@/types/models";
import { startAndPoll } from "../startAndPoll";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useWorkspace } from "@/stores/useWorkspace";
import { createUserHeadersAction } from "@/actions/auth";
import { queryKeys } from "@/lib/queryKeys";

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

/**
 * Centralized models query.
 *
 * Implementation note: `useQuery({ enabled: false })` is used here on purpose.
 * React Query's `QueryObserver.onSubscribe` triggers a fetch every time a new
 * observer subscribes to a query with no successful data, regardless of
 * `refetchOnMount: false`. In dev, React Strict Mode + Next.js Fast Refresh
 * cause repeated remounts, which thrash that subscribe-triggers-fetch path
 * and never let the error state settle.
 *
 * Instead, the observer never auto-fetches; one `queryClient.fetchQuery` call
 * gated on the cache state populates the result. Subsequent remounts read
 * the cached result (data or error) without re-fetching.
 *
 * To force a retry after failure: `queryClient.invalidateQueries({
 * queryKey: queryKeys.models.all })` or reload the page.
 */
export const useModelsQuery = () => {
    const queryClient = useQueryClient();

    useEffect(() => {
        const state = queryClient.getQueryState<Model[], Error>(
            queryKeys.models.all as unknown as readonly unknown[],
        );
        const isFetching = state?.fetchStatus === "fetching";
        const hasResult = state?.data !== undefined || state?.error != null;
        if (!isFetching && !hasResult) {
            queryClient
                .fetchQuery<Model[]>({
                    queryKey: queryKeys.models.all,
                    queryFn: getModels,
                    retry: false,
                    staleTime: Infinity,
                })
                .catch(() => {
                    /* error lives in the cache; consumers read it via useQuery */
                });
        }
    }, [queryClient]);

    return useQuery({
        queryKey: queryKeys.models.all,
        queryFn: getModels,
        enabled: false,
        retry: false,
        staleTime: Infinity,
    });
};
