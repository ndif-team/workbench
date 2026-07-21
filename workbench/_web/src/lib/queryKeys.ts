export const queryKeys = {
    workspaces: {
        all: ["workspaces"] as const,
        workspace: (workspaceId: string) => ["workspace", workspaceId] as const,
    },
    charts: {
        all: ["lensCharts"] as const,
        chart: (chartId: string) => ["chart", chartId] as const,
        config: (configId: string) => ["config", configId] as const,
        configByChart: (chartId: string) => ["chartConfig", chartId] as const,
        sidebar: (workspaceId: string) => ["chartsForSidebar", workspaceId] as const,
    },
    views: {
        byChart: (chartId: string) => ["views", chartId] as const,
    },
    documents: {
        one: (documentId: string) => ["document", documentId] as const,
        byWorkspace: (workspaceId: string) => ["documents", workspaceId] as const,
        workspaceDoc: (workspaceId: string) => ["document-workspace", workspaceId] as const,
    },
    lensRuns: {
        byChart: (chartId: string, model?: string) => ["lensRuns", chartId, model ?? null] as const,
        heatmaps: (ids: string[]) => ["lensRunHeatmaps", ...ids] as const,
    },
    models: {
        all: ["models"] as const,
    },
    workshops: {
        all: ["workshops"] as const,
        byWorkspace: (workspaceId: string) => ["workshop-for-workspace", workspaceId] as const,
        // Prefix that matches every per-workshop analytics query — invalidate this
        // to refresh all dashboards after an edit that can change their contents.
        analyticsAll: ["workshop-analytics"] as const,
        analytics: (workshopId: string) => ["workshop-analytics", workshopId] as const,
    },
    tutorials: {
        all: ["tutorials"] as const,
        one: (id: string) => ["tutorial", id] as const,
        byWorkspace: (workspaceId: string) => ["tutorial-for-workspace", workspaceId] as const,
    },
};
