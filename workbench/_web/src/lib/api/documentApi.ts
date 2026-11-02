import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    getDocumentById,
    getDocumentsForWorkspace,
    createDocument,
} from "@/lib/queries/documentQueries";
import { updateDocument, deleteDocument } from "@/lib/queries/documentQueries";
import { SerializedEditorState } from "lexical";
import type { DocumentListItem } from "@/lib/queries/documentQueries";
import { queryKeys } from "@/lib/queryKeys";

export const useGetDocument = (documentId: string) => {
    return useQuery({
        queryKey: queryKeys.documents.one(documentId),
        queryFn: () => getDocumentById(documentId),
        enabled: !!documentId,
    });
};

export const useGetDocumentsForWorkspace = (workspaceId: string) => {
    return useQuery<DocumentListItem[]>({
        queryKey: queryKeys.documents.byWorkspace(workspaceId),
        queryFn: () => getDocumentsForWorkspace(workspaceId),
        enabled: !!workspaceId,
    });
};

export const useSaveDocument = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            workspaceId,
            documentId,
            content,
        }: {
            workspaceId: string;
            documentId: string;
            content: SerializedEditorState;
        }) => {
            return await updateDocument(documentId, content);
        },
        // The editor initializes from this cache when the report is next
        // opened. Put the content being saved there now: the save that runs
        // as the editor unmounts (leaving the report flushes it) would
        // otherwise only mark the cache stale, and the reopened report would
        // start from the copy before the edit, and save it back over the edit.
        onMutate: ({ documentId, content }) => {
            queryClient.setQueryData(
                queryKeys.documents.one(documentId),
                (old: Awaited<ReturnType<typeof getDocumentById>> | undefined) =>
                    old ? { ...old, content } : old,
            );
        },
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.documents.byWorkspace(variables.workspaceId),
            });
            if (variables.documentId) {
                queryClient.invalidateQueries({
                    queryKey: queryKeys.documents.one(variables.documentId),
                });
            }
            queryClient.invalidateQueries({
                queryKey: queryKeys.documents.workspaceDoc(variables.workspaceId),
            });
        },
        onError: (error) => {
            console.error("Error saving document:", error);
        },
    });
};

export const useCreateDocument = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (workspaceId: string) => {
            return await createDocument(workspaceId);
        },
        onSuccess: (_, workspaceId) => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.documents.byWorkspace(workspaceId),
            });
        },
        onError: (error) => {
            console.error("Error creating document:", error);
        },
    });
};

export const useDeleteDocument = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({
            workspaceId,
            documentId,
        }: {
            workspaceId: string;
            documentId: string;
        }) => {
            await deleteDocument(documentId);
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.documents.byWorkspace(variables.workspaceId),
            });
            queryClient.invalidateQueries({
                queryKey: queryKeys.documents.one(variables.documentId),
            });
        },
        onError: (error) => {
            console.error("Error deleting document:", error);
        },
    });
};
