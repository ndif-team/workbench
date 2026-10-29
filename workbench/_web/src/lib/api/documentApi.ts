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
import { deriveReportTitle } from "@/lib/reportTitle";
import type { WorkspaceLibrary } from "@/types/workspaces";
import { findLibraryItem } from "./workspaceApi";

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

/** The library with one report's title replaced, where it is listed. */
const retitleInLibrary = (library: WorkspaceLibrary, reportId: string, title: string) => {
    const retitle = <T extends WorkspaceLibrary["defaultItems"][number]>(item: T): T =>
        item.kind === "report" && item.id === reportId ? { ...item, title } : item;
    return {
        ...library,
        defaultItems: library.defaultItems.map(retitle),
        workspaces: library.workspaces.map((w) => ({ ...w, items: w.items.map(retitle) })),
    };
};

/**
 * Saves a report (the editor's autosave). The lists that show the report
 * only show its title, so instead of refetching them after every save, the
 * cached title is updated in place when the save changed it.
 */
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
        onSuccess: (saved, variables) => {
            const title = deriveReportTitle(saved.content as SerializedEditorState);
            const library = queryClient.getQueryData<WorkspaceLibrary>(
                queryKeys.workspaces.library,
            );
            const listed = library && findLibraryItem(library, "report", saved.id);
            if (listed?.kind === "report" && listed.title !== title) {
                queryClient.setQueryData<WorkspaceLibrary>(queryKeys.workspaces.library, (lib) =>
                    lib ? retitleInLibrary(lib, saved.id, title) : lib,
                );
            }
            queryClient.setQueryData<DocumentListItem[]>(
                queryKeys.documents.byWorkspace(variables.workspaceId),
                (reports) =>
                    reports?.some((r) => r.id === saved.id && r.derivedTitle !== title)
                        ? reports.map((r) =>
                              r.id === saved.id ? { ...r, derivedTitle: title } : r,
                          )
                        : reports,
            );
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
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
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
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
            queryClient.invalidateQueries({
                queryKey: queryKeys.documents.one(variables.documentId),
            });
        },
        onError: (error) => {
            console.error("Error deleting document:", error);
        },
    });
};
