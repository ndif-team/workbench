export const queryKeys = {
  // models: {
  //     all: ["models"] as const,
  // },
  // users: {
  //     all: ["users"] as const,
  //     lists: () => ["users", "list"] as const,
  //     list: (filters: unknown) => ["users", "list", filters] as const,
  //     details: () => ["users", "detail"] as const,
  //     detail: (id: string | number) => ["users", "detail", id] as const,
  // },
  charts: {
    all: ["lensCharts"] as const,
    chart: (chartId: string) => ["chart", chartId] as const,
    config: (configId: string) => ["config", configId] as const,
    configByChart: (chartId: string) => ["chartConfig", chartId] as const,
    sidebar: () => ["chartsForSidebar"] as const,
  },
  views: {
    byChart: (chartId: string) => ["views", chartId] as const,
  },
  // documents: {
  //     one: (documentId: string) => ["document", documentId] as const,
  //     byWorkspace: (workspaceId: string) => ["documents", workspaceId] as const,
  //     workspaceDoc: (workspaceId: string) => ["document", workspaceId] as const,
  // },
  // workspaces: {
  //     all: ["workspaces"] as const,
  // },
};

// export type QueryKey = ReturnType<
//     | typeof queryKeys.models.all
//     | typeof queryKeys.users.lists
// >;
