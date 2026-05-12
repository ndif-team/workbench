import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
    createWorkspace,
    deleteWorkspace,
    updateWorkspace,
    reorderWorkspaceItems,
    type WorkspaceItemKind,
} from "@/lib/queries/workspaceQueries";
import { queryKeys } from "@/lib/queryKeys";
import type { ChartMetadata } from "@/types/charts";
import type { DocumentListItem } from "@/lib/queries/documentQueries";

export const useCreateWorkspace = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ userId, name }: { userId: string; name: string }) => {
            // This calls the server action which handles authentication
            const newWorkspace = await createWorkspace(userId, name);
            return newWorkspace;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["workspaces"] });
            console.log("Successfully created workspace");
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
            queryClient.invalidateQueries({ queryKey: ["workspaces"] });
            console.log("Successfully deleted workspace");
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
            queryClient.setQueryData(
                queryKeys.charts.sidebar(workspaceId),
                context.prevCharts,
            );
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
        },
    });
};

export const useUpdateWorkspaceName = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ workspaceId, name, userId }: { workspaceId: string; name: string; userId: string }) => {
            const updated = await updateWorkspace(workspaceId, { name }, userId);
            return updated;
        },
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.workspace(variables.workspaceId) });
        },
        onError: (error) => {
            console.error("Error updating workspace name:", error);
        },
    });
};
