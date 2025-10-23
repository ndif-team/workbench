import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    getDocumentById,
    getDocumentByWorkspaceId,
    getDocumentsForWorkspace,
    createDocument,
} from "@/lib/queries/documentQueries";
import { updateDocument, deleteDocument } from "@/lib/queries/documentQueries";
import { SerializedEditorState } from "lexical";
import type { DocumentListItem } from "@/lib/queries/documentQueries";

export const useGetDocument = (documentId: string) => {
    return useQuery({
        queryKey: ["document", documentId],
        queryFn: () => getDocumentById(documentId),
        enabled: !!documentId,
    });
};

export const useGetDocumentByWorkspace = (workspaceId: string) => {
    return useQuery({
        queryKey: ["document-workspace", workspaceId],
        queryFn: () => getDocumentByWorkspaceId(workspaceId),
        enabled: !!workspaceId,
    });
};

export const useGetDocumentsForWorkspace = (workspaceId: string) => {
    return useQuery<DocumentListItem[]>({
        queryKey: ["documents", workspaceId],
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
        onSuccess: (data, variables) => {
            // Invalidate workspace documents list and specific document cache
            queryClient.invalidateQueries({ queryKey: ["documents", variables.workspaceId] });
            if (variables.documentId) {
                queryClient.invalidateQueries({ queryKey: ["document", variables.documentId] });
            }
            // Legacy key invalidation if used elsewhere
            queryClient.invalidateQueries({
                queryKey: ["document-workspace", variables.workspaceId],
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
            // Refresh documents list
            queryClient.invalidateQueries({ queryKey: ["documents", workspaceId] });
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
            queryClient.invalidateQueries({ queryKey: ["documents", variables.workspaceId] });
            queryClient.invalidateQueries({ queryKey: ["document", variables.documentId] });
        },
        onError: (error) => {
            console.error("Error deleting document:", error);
        },
    });
};
