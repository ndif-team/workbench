export const queryKeys = {
    models: {
        all: ["models"] as const,
    },
    users: {
        all: ["users"] as const,
        lists: () => ["users", "list"] as const,
        list: (filters: unknown) => ["users", "list", filters] as const,
        details: () => ["users", "detail"] as const,
        detail: (id: string | number) => ["users", "detail", id] as const,
    },
    charts: {
        all: ["lensCharts"] as const,
        byId: (chartId: string) => ["chartById", chartId] as const,
        config: (chartId: string) => ["chartConfig", chartId] as const,
        configs: (workspaceId: string, chartId: string) => ["configs", workspaceId, chartId] as const,
        sidebar: (workspaceId: string) => ["chartsForSidebar", workspaceId] as const,
        patchAll: ["patchCharts"] as const,
        basicByWorkspace: (workspaceId: string) => ["basicChartsWithTool", workspaceId] as const,
        mostRecentByWorkspace: (workspaceId: string) => ["chart", workspaceId] as const,
    },
    views: {
        byChart: (chartId: string) => ["views", chartId] as const,
    },
    documents: {
        one: (documentId: string) => ["document", documentId] as const,
        byWorkspace: (workspaceId: string) => ["documents", workspaceId] as const,
        workspaceDoc: (workspaceId: string) => ["document", workspaceId] as const,
    },
    workspaces: {
        all: ["workspaces"] as const,
    },
};

export type QueryKey = ReturnType<
    | typeof queryKeys.models.all
    | typeof queryKeys.users.lists
>;

