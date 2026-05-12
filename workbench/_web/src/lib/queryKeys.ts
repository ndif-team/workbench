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
};
