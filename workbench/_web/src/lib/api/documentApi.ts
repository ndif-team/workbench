import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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

const documentQuery = (documentId: string) => ({
    queryKey: queryKeys.documents.one(documentId),
    queryFn: () => getDocumentById(documentId),
    enabled: !!documentId,
});

export const useGetDocument = (documentId: string) => useQuery(documentQuery(documentId));

/**
 * A report as its editor opens it: read again each time the editor mounts,
 * because an editor that started from an older cached copy would save that
 * copy over the newer one with its first edit.
 */
export const useReportForEditor = (documentId: string) =>
    useQuery({ ...documentQuery(documentId), refetchOnMount: "always" });

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
        // Put the content being saved in the cache now, so the report reads
        // as edited wherever it shows before the save lands. A fetch of the
        // report already under way would put the copy from before this save
        // back over it, so it's cancelled first.
        onMutate: async ({ documentId, content }) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.documents.one(documentId) });
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
            toast.error("Couldn't save the report", {
                id: "report-save",
                description: "Your next edit tries again. Until then, keep the report open.",
            });
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
