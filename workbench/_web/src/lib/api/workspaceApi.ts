import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
    createUserWorkspace,
    deleteUserWorkspace,
    getWorkspaceLibrary,
    moveChart,
    moveReport,
    renameUserWorkspace,
    reorderWorkspaceItems,
} from "@/lib/queries/workspaceQueries";
import { queryKeys } from "@/lib/queryKeys";
import type { ChartMetadata } from "@/types/charts";
import type { DocumentListItem } from "@/lib/queries/documentQueries";
import type { LibraryItem, WorkspaceItemKind, WorkspaceLibrary } from "@/types/workspaces";

/**
 * The signed-in user's workspaces with their charts and reports (global
 * sidebar). Reading it creates the user's default workspace, so leave it
 * disabled where only a workshop workspace is in view.
 */
export const useWorkspaceLibrary = ({ enabled = true }: { enabled?: boolean } = {}) =>
    useQuery<WorkspaceLibrary>({
        queryKey: queryKeys.workspaces.library,
        queryFn: () => getWorkspaceLibrary(),
        enabled,
    });

/** The library's entry for a chart or report, wherever it is filed. */
export const findLibraryItem = (
    library: WorkspaceLibrary,
    kind: WorkspaceItemKind,
    id: string,
): LibraryItem | undefined =>
    [library.defaultItems, ...library.workspaces.map((w) => w.items)]
        .flat()
        .find((item) => item.kind === kind && item.id === id);

/** Refetches every list an item can appear in after it changes workspace. */
const invalidateItemLists = (queryClient: QueryClient) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
    queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.charts.sidebarAll });
    queryClient.invalidateQueries({ queryKey: queryKeys.documents.byWorkspaceAll });
};

/**
 * Moves a chart (with its config and lens runs) to a workspace; a null target
 * is the default workspace. Refreshes the route so a page showing the chart
 * picks up its new workspace scope.
 */
export const useMoveChart = () => {
    const queryClient = useQueryClient();
    const router = useRouter();

    return useMutation({
        mutationFn: ({
            chartId,
            targetWorkspaceId,
        }: {
            chartId: string;
            targetWorkspaceId: string | null;
        }) => moveChart(chartId, targetWorkspaceId),
        onSuccess: (_, { chartId }) => {
            invalidateItemLists(queryClient);
            queryClient.invalidateQueries({ queryKey: queryKeys.charts.chart(chartId) });
            router.refresh();
        },
        onError: () => toast.error("Couldn't move the chart"),
    });
};

/** Moves a report to a workspace; a null target is the default workspace. */
export const useMoveReport = () => {
    const queryClient = useQueryClient();
    const router = useRouter();

    return useMutation({
        mutationFn: ({
            documentId,
            targetWorkspaceId,
        }: {
            documentId: string;
            targetWorkspaceId: string | null;
        }) => moveReport(documentId, targetWorkspaceId),
        onSuccess: (_, { documentId }) => {
            invalidateItemLists(queryClient);
            queryClient.invalidateQueries({ queryKey: queryKeys.documents.one(documentId) });
            router.refresh();
        },
        onError: () => toast.error("Couldn't move the report"),
    });
};

/** Creates a workspace (folder) for the signed-in user. */
export const useCreateWorkspace = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ name }: { name: string }) => createUserWorkspace(name),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
        },
        onError: (error) => {
            console.error("Error creating workspace:", error);
        },
    });
};

/** Deletes one of the signed-in user's workspaces, and its contents with it. */
export const useDeleteWorkspace = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ workspaceId }: { workspaceId: string }) => deleteUserWorkspace(workspaceId),
        onSuccess: () => invalidateItemLists(queryClient),
        onError: () => toast.error("Couldn't delete the workspace"),
    });
};

type ReorderVariables = {
    workspaceId: string;
    items: { kind: WorkspaceItemKind; id: string }[];
};

type ReorderContext = {
    prevCharts: ChartMetadata[] | undefined;
    prevReports: DocumentListItem[] | undefined;
    prevLibrary: WorkspaceLibrary | undefined;
};

/** The library with one workspace's items put in `items` order (optimistic reorder). */
const reorderLibraryFolder = (
    library: WorkspaceLibrary,
    workspaceId: string,
    items: { kind: WorkspaceItemKind; id: string }[],
): WorkspaceLibrary => {
    const rank = new Map(items.map((it, i) => [`${it.kind}:${it.id}`, i]));
    return {
        ...library,
        workspaces: library.workspaces.map((w) =>
            w.id !== workspaceId
                ? w
                : {
                      ...w,
                      items: w.items
                          .map((item) => ({
                              ...item,
                              position: rank.get(`${item.kind}:${item.id}`) ?? item.position,
                          }))
                          .sort((a, b) => a.position - b.position),
                  },
        ),
    };
};

export const useReorderWorkspaceItems = () => {
    const queryClient = useQueryClient();

    return useMutation<void, Error, ReorderVariables, ReorderContext>({
        mutationFn: async ({ workspaceId, items }) => {
            await reorderWorkspaceItems(workspaceId, items);
        },
        onMutate: async ({ workspaceId, items }) => {
            const chartsKey = queryKeys.charts.sidebar(workspaceId);
            const reportsKey = queryKeys.documents.byWorkspace(workspaceId);

            await queryClient.cancelQueries({ queryKey: chartsKey });
            await queryClient.cancelQueries({ queryKey: reportsKey });
            await queryClient.cancelQueries({ queryKey: queryKeys.workspaces.library });

            const prevCharts = queryClient.getQueryData<ChartMetadata[]>(chartsKey);
            const prevReports = queryClient.getQueryData<DocumentListItem[]>(reportsKey);
            const prevLibrary = queryClient.getQueryData<WorkspaceLibrary>(
                queryKeys.workspaces.library,
            );
            if (prevLibrary) {
                queryClient.setQueryData(
                    queryKeys.workspaces.library,
                    reorderLibraryFolder(prevLibrary, workspaceId, items),
                );
            }

            const positionByItem = new Map<string, number>();
            items.forEach((it, i) => positionByItem.set(`${it.kind}:${it.id}`, i));

            queryClient.setQueryData<ChartMetadata[]>(chartsKey, (prev) =>
                (prev ?? []).map((c) => ({
                    ...c,
                    position: positionByItem.get(`chart:${c.id}`) ?? c.position,
                })),
            );
            queryClient.setQueryData<DocumentListItem[]>(reportsKey, (prev) =>
                (prev ?? []).map((r) => ({
                    ...r,
                    position: positionByItem.get(`report:${r.id}`) ?? r.position,
                })),
            );

            return { prevCharts, prevReports, prevLibrary };
        },
        onError: (_err, { workspaceId }, context) => {
            if (!context) return;
            queryClient.setQueryData(queryKeys.charts.sidebar(workspaceId), context.prevCharts);
            queryClient.setQueryData(
                queryKeys.documents.byWorkspace(workspaceId),
                context.prevReports,
            );
            queryClient.setQueryData(queryKeys.workspaces.library, context.prevLibrary);
        },
        onSettled: (_data, _err, { workspaceId }) => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.charts.sidebar(workspaceId),
            });
            queryClient.invalidateQueries({
                queryKey: queryKeys.documents.byWorkspace(workspaceId),
            });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
        },
    });
};

/** Renames one of the signed-in user's workspaces. */
export const useRenameWorkspace = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ workspaceId, name }: { workspaceId: string; name: string }) =>
            renameUserWorkspace(workspaceId, name),
        onSuccess: (_, { workspaceId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
            queryClient.invalidateQueries({
                queryKey: queryKeys.workspaces.workspace(workspaceId),
            });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
        },
        onError: () => toast.error("Couldn't rename the workspace"),
    });
};
