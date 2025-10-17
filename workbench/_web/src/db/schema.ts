import {
  workspaces as sqliteWorkspaces,
  charts as sqliteCharts,
  configs as sqliteConfigs,
  chartConfigLinks as sqliteChartConfigLinks,
  views as sqliteViews,
  documents as sqliteDocuments,
} from "./schema.sqlite";
import {
  workspaces as pgWorkspaces,
  charts as pgCharts,
  configs as pgConfigs,
  chartConfigLinks as pgChartConfigLinks,
  views as pgViews,
  documents as pgDocuments,
} from "./schema.pg";
import type { LensConfig } from "@/types/lens";
import type { HeatmapRow, HeatmapViewData, LineViewData, Line } from "@/types/charts";

// Conditionally export the appropriate schema based on environment
const isLocal = process.env.NEXT_PUBLIC_LOCAL_DB === "true";

export const workspaces = isLocal ? sqliteWorkspaces : pgWorkspaces;
export const charts = isLocal ? sqliteCharts : pgCharts;
export const configs = isLocal ? sqliteConfigs : pgConfigs;
export const chartConfigLinks = isLocal ? sqliteChartConfigLinks : pgChartConfigLinks;
export const documents = isLocal ? sqliteDocuments : pgDocuments;
export const views = isLocal ? sqliteViews : pgViews;

// Generate types from schema
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;

export type Chart = typeof charts.$inferSelect;
export type NewChart = typeof charts.$inferInsert;

export type Config = typeof configs.$inferSelect;
export type NewConfig = typeof configs.$inferInsert;

export type ChartConfigLink = typeof chartConfigLinks.$inferSelect;
export type NewChartConfigLink = typeof chartConfigLinks.$inferInsert;

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;

export type View = typeof views.$inferSelect;
export type NewView = typeof views.$inferInsert;

export type HeatmapView = Omit<View, "data"> & {
  data: HeatmapViewData;
};

export type LineView = Omit<View, "data"> & {
  data: LineViewData;
};

export type HeatmapChart = Omit<Chart, "data"> & {
  data: HeatmapRow[];
};

export type LineChart = Omit<Chart, "data"> & {
  data: Line[];
};

// Specific chart config types
export type LensConfig = Omit<Config, "data"> & {
  data: LensConfig;
};
