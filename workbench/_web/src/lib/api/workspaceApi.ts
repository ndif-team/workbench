import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
    createUserWorkspace,
    deleteWorkspace,
    getWorkspaceLibrary,
    moveChart,
    moveReport,
    updateWorkspace,
    reorderWorkspaceItems,
    type WorkspaceItemKind,
} from "@/lib/queries/workspaceQueries";
import { queryKeys } from "@/lib/queryKeys";
import type { ChartMetadata } from "@/types/charts";
import type { DocumentListItem } from "@/lib/queries/documentQueries";
import type { WorkspaceLibrary } from "@/types/workspaces";

/** The signed-in user's workspaces with their charts and reports (global sidebar). */
export const useWorkspaceLibrary = () =>
    useQuery<WorkspaceLibrary>({
        queryKey: queryKeys.workspaces.library,
        queryFn: () => getWorkspaceLibrary(),
    });

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

export const useDeleteWorkspace = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ userId, workspaceId }: { userId: string; workspaceId: string }) => {
            await deleteWorkspace(userId, workspaceId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
        },
        onError: (error) => {
            console.error("Error deleting workspace:", error);
        },
    });
};

type ReorderVariables = {
    workspaceId: string;
    items: { kind: WorkspaceItemKind; id: string }[];
};

type ReorderContext = {
    prevCharts: ChartMetadata[] | undefined;
    prevReports: DocumentListItem[] | undefined;
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

            const prevCharts = queryClient.getQueryData<ChartMetadata[]>(chartsKey);
            const prevReports = queryClient.getQueryData<DocumentListItem[]>(reportsKey);

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

            return { prevCharts, prevReports };
        },
        onError: (_err, { workspaceId }, context) => {
            if (!context) return;
            queryClient.setQueryData(queryKeys.charts.sidebar(workspaceId), context.prevCharts);
            queryClient.setQueryData(
                queryKeys.documents.byWorkspace(workspaceId),
                context.prevReports,
            );
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

export const useUpdateWorkspaceName = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            workspaceId,
            name,
            userId,
        }: {
            workspaceId: string;
            name: string;
            userId: string;
        }) => {
            const updated = await updateWorkspace(workspaceId, { name }, userId);
            return updated;
        },
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
            queryClient.invalidateQueries({
                queryKey: queryKeys.workspaces.workspace(variables.workspaceId),
            });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
        },
        onError: (error) => {
            console.error("Error updating workspace name:", error);
        },
    });
};
