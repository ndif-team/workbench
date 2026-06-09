import { useCallback, useEffect } from "react";
import config from "@/lib/config";
import type { LensConfigData } from "@/types/lens";
import type { Model, Token } from "@/types/models";
import { startAndPoll } from "../startAndPoll";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useWorkspace } from "@/stores/useWorkspace";
import { useModelDeployment } from "@/stores/useModelDeployment";
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

export interface Completion {
    prompt: string;
    max_new_tokens: number;
    model: string;
    temperature?: number;
    top_p?: number;
    top_k?: number;
    stop_strings?: string[];
}

export interface GenerationResponse {
    completion: Token[];
    last_token_prediction: Prediction;
}

export const generateCompletion = async (request: Completion): Promise<GenerationResponse> => {
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
        mutationFn: generateCompletion,
        onError: (error, variables, context) => {
            toast.error(`Error: ${error}`);
        },
    });
};

export const getModels = async (): Promise<Model[]> => {
    const headers = await createUserHeadersAction();
    const response = await fetch(config.getApiUrl(config.endpoints.models), {
        // Send cookies cross-origin so the oauth2-proxy session set by
        // pr-*.ndif-preview.ripley.cloud is carried to api.pr-*.ndif-preview…
        credentials: "include",
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
/** Background refresh cadence for the model catalog (ms). Kept at or above the
 * backend's NDIF /status cache TTL (`MODEL_INTERVAL`, currently 30s) — polling
 * faster wastes calls because the backend would just return its own cached
 * payload. Polling slower means heat changes (cold → hot) take longer than
 * necessary to surface. */
const MODELS_REFRESH_INTERVAL_MS = 60_000;

export const useModelsQuery = () => {
    const queryClient = useQueryClient();
    const deployments = useModelDeployment((s) => s.deployments);

    // Once a cold model has been deployed (its warmup job COMPLETED and the
    // deployment phase is "ready"), force its catalog status to "hot".
    //
    // We can't rely on re-fetching to surface this: the heat is cached at
    // several levels (our backend catalog AND NDIF itself), and NDIF exposes
    // no way to bust its cache — a refresh can keep reporting COLD for a model
    // we just warmed up. So the override lives here in the read path and is
    // re-applied on every fetch, surviving the periodic background refresh
    // below. It resets naturally on a full reload, when the deployment store
    // (module-global, not persisted) clears and the backend is truth again.
    const applyDeployedHeat = useCallback(
        (models: Model[]): Model[] => {
            const deployed = new Set(
                Object.values(deployments)
                    .filter((d) => d.phase === "ready")
                    .map((d) => d.model),
            );
            if (deployed.size === 0) return models;
            return models.map((m) => (deployed.has(m.name) ? { ...m, status: "hot" as const } : m));
        },
        [deployments],
    );

    // Initial fetch on first mount (only when the cache is genuinely empty).
    // Avoids React Query's automatic on-subscribe refetch path, which thrashes
    // in dev under Strict Mode + Fast Refresh.
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

    // Periodic background refresh so deployment-status changes (cold → hot,
    // models being added/removed from NDIF) propagate to the UI without a
    // page reload. `staleTime: 0` here means the call actually hits the
    // network instead of being short-circuited by the cache. Observers
    // subscribed to this query re-render when the cache updates.
    useEffect(() => {
        const id = setInterval(() => {
            queryClient
                .fetchQuery<Model[]>({
                    queryKey: queryKeys.models.all,
                    queryFn: getModels,
                    retry: false,
                    staleTime: 0,
                })
                .catch(() => {
                    /* keep last known good catalog on transient errors */
                });
        }, MODELS_REFRESH_INTERVAL_MS);
        return () => clearInterval(id);
    }, [queryClient]);

    return useQuery({
        queryKey: queryKeys.models.all,
        queryFn: getModels,
        enabled: false,
        retry: false,
        staleTime: Infinity,
        select: applyDeployedHeat,
    });
};
