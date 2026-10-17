/**
 * Algorithm Hypothesis client API: algorithms (server data) and model tokens.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
    createAlgorithm,
    getAlgorithmById,
    getAlgorithmsForWorkspace,
    getSavedAlgorithmsForWorkspace,
    saveAlgorithmVersion,
    updateAlgorithm,
} from "@/lib/queries/algorithmQueries";
import { encodeText } from "@/actions/tok";
import { queryKeys } from "@/lib/queryKeys";
import type { AlgorithmDefinition } from "@/types/algorithmHypothesis";
import { TOKENIZER_MIRRORS } from "@/lib/algorithmHypothesis/grids";

/** A prompt's tokens, falling back to an ungated tokenizer mirror for gated models. */
async function modelTokens(text: string, model: string): Promise<string[]> {
    try {
        return (await encodeText(text, model)).map((t) => t.text);
    } catch (error) {
        const mirror = TOKENIZER_MIRRORS[model];
        if (!mirror) throw error;
        return (await encodeText(text, mirror)).map((t) => t.text);
    }
}

export const useAlgorithm = (algorithmId: string | undefined) =>
    useQuery({
        queryKey: queryKeys.algorithms.one(algorithmId ?? ""),
        queryFn: () => getAlgorithmById(algorithmId as string),
        enabled: !!algorithmId,
    });

export const useWorkspaceAlgorithms = (workspaceId: string | undefined) =>
    useQuery({
        queryKey: queryKeys.algorithms.byWorkspace(workspaceId ?? ""),
        queryFn: () => getAlgorithmsForWorkspace(workspaceId as string),
        enabled: !!workspaceId,
    });

/** Saved versions of the workspace's saved algorithms (intervention and sweep views). */
export const useSavedAlgorithms = (workspaceId: string | undefined, enabled = true) =>
    useQuery({
        queryKey: queryKeys.algorithms.saved(workspaceId ?? ""),
        queryFn: () => getSavedAlgorithmsForWorkspace(workspaceId as string),
        enabled: !!workspaceId && enabled,
    });

/** Save the working copy as the algorithm's saved version. */
export const useSaveAlgorithmVersion = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, definition }: { id: string; definition: AlgorithmDefinition }) =>
            saveAlgorithmVersion(id, definition),
        onSuccess: (row) => {
            if (!row) return;
            queryClient.setQueryData(queryKeys.algorithms.one(row.id), row);
            queryClient.invalidateQueries({
                queryKey: queryKeys.algorithms.byWorkspace(row.workspaceId),
            });
        },
        onError: () => toast.error("Couldn't save the algorithm. Try again."),
    });
};

/** Autosave target: errors are shown inline by the editor, so no toast here. */
export const useSaveAlgorithm = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, definition }: { id: string; definition: AlgorithmDefinition }) =>
            updateAlgorithm(id, definition),
        onSuccess: (row) => {
            if (!row) return;
            queryClient.setQueryData(queryKeys.algorithms.one(row.id), row);
            queryClient.invalidateQueries({
                queryKey: queryKeys.algorithms.byWorkspace(row.workspaceId),
            });
        },
    });
};

export const useCreateAlgorithm = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({
            workspaceId,
            definition,
        }: {
            workspaceId: string;
            definition: AlgorithmDefinition;
        }) => createAlgorithm(workspaceId, definition),
        onSuccess: (row) => {
            queryClient.setQueryData(queryKeys.algorithms.one(row.id), row);
            queryClient.invalidateQueries({
                queryKey: queryKeys.algorithms.byWorkspace(row.workspaceId),
            });
        },
    });
};

/** A prompt's tokens under a model's tokenizer (decoded text per token). Runs
 * only the tokenizer, never the model. */
export const useModelTokens = (model: string | undefined, text: string) =>
    useQuery({
        queryKey: queryKeys.algorithms.tokens(model ?? "", text),
        queryFn: () => modelTokens(text, model as string),
        enabled: !!model && text.trim().length > 0,
        staleTime: Infinity,
        retry: false,
    });
