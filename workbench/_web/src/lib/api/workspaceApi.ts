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
import { normalizeTool, useCapture } from "@/lib/analytics";
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

/**
 * Why `name` can't name a workspace: another of the user's workspaces
 * (`exceptId` aside) already has it, ignoring case and surrounding space.
 * Null when it is free, or while the library is loading (the server checks
 * again).
 */
export const workspaceNameError = (
    library: WorkspaceLibrary | undefined,
    name: string,
    exceptId?: string,
): string | null => {
    const wanted = name.trim().toLowerCase();
    const taken = library?.workspaces.find(
        (w) => w.id !== exceptId && w.name.trim().toLowerCase() === wanted,
    );
    return taken ? `A workspace named "${taken.name}" already exists.` : null;
};

/**
 * An item's analytics properties, read from the cached lists in a mutation's
 * `onMutate`, before the mutation changes them. The library holds the global
 * sidebar's items; a workshop sidebar has only its workspace's lists.
 */
export class ItemAnalytics {
    private static library(queryClient: QueryClient) {
        return queryClient.getQueryData<WorkspaceLibrary>(queryKeys.workspaces.library);
    }

    /** A chart's workspace, tool, and whether it has a result. */
    static chart(
        queryClient: QueryClient,
        chartId: string,
    ): { workspace_id?: string; tool?: string; had_data?: boolean } {
        const library = ItemAnalytics.library(queryClient);
        const listed = library && findLibraryItem(library, "chart", chartId);
        if (listed?.kind === "chart") {
            return {
                workspace_id: listed.workspaceId,
                tool: normalizeTool(listed.toolType),
                had_data: listed.hasData,
            };
        }
        const lists = queryClient.getQueriesData<ChartMetadata[]>({
            queryKey: queryKeys.charts.sidebarAll,
        });
        for (const [[, workspaceId], charts] of lists) {
            const card = charts?.find((c) => c.id === chartId);
            if (card) {
                return {
                    workspace_id: workspaceId as string,
                    tool: normalizeTool(card.toolType ?? card.chartType),
                    had_data: !!card.hasData,
                };
            }
        }
        return {};
    }

    /** A report's workspace, and whether it has any text (an untitled report has none). */
    static report(
        queryClient: QueryClient,
        reportId: string,
    ): { workspace_id?: string; had_text?: boolean } {
        const library = ItemAnalytics.library(queryClient);
        const listed = library && findLibraryItem(library, "report", reportId);
        if (listed?.kind === "report") {
            return { workspace_id: listed.workspaceId, had_text: listed.title !== "" };
        }
        const lists = queryClient.getQueriesData<DocumentListItem[]>({
            queryKey: queryKeys.documents.byWorkspaceAll,
        });
        for (const [[, workspaceId], reports] of lists) {
            const row = reports?.find((r) => r.id === reportId);
            if (row)
                return { workspace_id: workspaceId as string, had_text: row.derivedTitle !== "" };
        }
        return {};
    }

    /** Where a move takes an item; a null target is the default workspace. */
    static move(queryClient: QueryClient, from: string | undefined, to: string | null) {
        const defaultId = ItemAnalytics.library(queryClient)?.defaultWorkspaceId ?? undefined;
        return {
            workspace_id: to ?? defaultId,
            from_workspace_id: from,
            to_default: to === null,
            from_default: !!from && from === defaultId,
        };
    }

    /** How many charts and reports a workspace holds. */
    static contents(queryClient: QueryClient, workspaceId: string) {
        const items =
            ItemAnalytics.library(queryClient)?.workspaces.find((w) => w.id === workspaceId)
                ?.items ?? [];
        const charts = items.filter((i) => i.kind === "chart").length;
        return { chart_count: charts, report_count: items.length - charts };
    }
}

/** How a move was started: an item's actions menu, or dropping a sidebar row on a folder. */
export type MoveVia = "menu" | "drag";

/** Where a workspace was created from. */
export type WorkspaceOrigin = "sidebar" | "workspaces_page" | "move_menu";

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
    const capture = useCapture();

    return useMutation({
        mutationKey: ["moveChart"],
        mutationFn: ({
            chartId,
            targetWorkspaceId,
        }: {
            chartId: string;
            targetWorkspaceId: string | null;
            via: MoveVia;
        }) => moveChart(chartId, targetWorkspaceId),
        onMutate: ({ chartId }) => ItemAnalytics.chart(queryClient, chartId),
        onSuccess: (_, { chartId, targetWorkspaceId, via }, chart) => {
            capture("chart_moved", {
                chart_id: chartId,
                tool: chart.tool,
                via,
                ...ItemAnalytics.move(queryClient, chart.workspace_id, targetWorkspaceId),
            });
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
    const capture = useCapture();

    return useMutation({
        mutationKey: ["moveReport"],
        mutationFn: ({
            documentId,
            targetWorkspaceId,
        }: {
            documentId: string;
            targetWorkspaceId: string | null;
            via: MoveVia;
        }) => moveReport(documentId, targetWorkspaceId),
        onMutate: ({ documentId }) => ItemAnalytics.report(queryClient, documentId),
        onSuccess: (_, { documentId, targetWorkspaceId, via }, report) => {
            capture("report_moved", {
                report_id: documentId,
                via,
                ...ItemAnalytics.move(queryClient, report.workspace_id, targetWorkspaceId),
            });
            invalidateItemLists(queryClient);
            queryClient.invalidateQueries({ queryKey: queryKeys.documents.one(documentId) });
            router.refresh();
        },
        onError: () => toast.error("Couldn't move the report"),
    });
};

/**
 * Creates a workspace (folder) for the signed-in user. Its name is user text,
 * so only its length is reported.
 */
export const useCreateWorkspace = () => {
    const queryClient = useQueryClient();
    const capture = useCapture();

    return useMutation({
        mutationKey: ["createWorkspace"],
        mutationFn: ({ name }: { name: string; origin: WorkspaceOrigin }) =>
            createUserWorkspace(name),
        onSuccess: (workspace, { name, origin }) => {
            capture("workspace_created", {
                workspace_id: workspace.id,
                name_length: name.length,
                origin,
            });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
        },
        onError: (error) => {
            console.error("Error creating workspace:", error);
        },
    });
};

/**
 * Deletes one of the signed-in user's workspaces, and its contents with it.
 * Its charts and reports are counted on `workspace_deleted` rather than as
 * deletions of their own.
 */
export const useDeleteWorkspace = () => {
    const queryClient = useQueryClient();
    const capture = useCapture();

    return useMutation({
        mutationKey: ["deleteWorkspace"],
        mutationFn: ({ workspaceId }: { workspaceId: string }) => deleteUserWorkspace(workspaceId),
        onMutate: ({ workspaceId }) => ItemAnalytics.contents(queryClient, workspaceId),
        onSuccess: (_, { workspaceId }, contents) => {
            capture("workspace_deleted", { workspace_id: workspaceId, ...contents });
            invalidateItemLists(queryClient);
        },
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
    const capture = useCapture();

    return useMutation({
        mutationKey: ["renameWorkspace"],
        mutationFn: ({ workspaceId, name }: { workspaceId: string; name: string }) =>
            renameUserWorkspace(workspaceId, name),
        onSuccess: (_, { workspaceId, name }) => {
            capture("workspace_renamed", { workspace_id: workspaceId, name_length: name.length });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
            queryClient.invalidateQueries({
                queryKey: queryKeys.workspaces.workspace(workspaceId),
            });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
        },
        onError: () => toast.error("Couldn't rename the workspace"),
    });
};
