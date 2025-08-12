import { boolean, jsonb, pgTable, varchar, uuid, timestamp } from "drizzle-orm/pg-core";
import type { ConfigData, ChartData, HeatmapData } from "@/types/charts";
import type { AnnotationData } from "@/types/annotations";
import type { LensConfigData } from "@/types/lens";

export const workspaces = pgTable("workspaces", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 256 }).notNull(),
    name: varchar("name", { length: 256 }).notNull(),
    public: boolean("public").default(false).notNull(),
});

export const chartTypes = [
    "line",
    "heatmap",
] as const;

export const charts = pgTable("charts", {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }).notNull(),

    name: varchar("name", { length: 256 }).notNull().default("Untitled Chart"),
    data: jsonb("data").$type<ChartData>(),
    type: varchar("type", { enum: chartTypes, length: 32 }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const configTypes = [
    "lens",
    "patch",
] as const;

export const configs = pgTable("configs", {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }).notNull(),

    data: jsonb("data").$type<ConfigData>().notNull(),
    type: varchar("type", { enum: configTypes, length: 32 }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const chartConfigLinks = pgTable("chart_config_links", {
    id: uuid("id").primaryKey().defaultRandom(),
    chartId: uuid("chart_id").references(() => charts.id, { onDelete: "cascade" }).notNull(),
    configId: uuid("config_id").references(() => configs.id, { onDelete: "cascade" }).notNull(),
});

export const annotationTypes = [
    "line",
    "heatmap",
] as const;

export const annotations = pgTable("annotations", {
    id: uuid("id").primaryKey().defaultRandom(),
    chartId: uuid("chart_id").references(() => charts.id, { onDelete: "cascade" }).notNull(),

    data: jsonb("data").$type<AnnotationData>().notNull(),
    type: varchar("type", { enum: annotationTypes, length: 32 }).notNull(),
});

export const documents = pgTable("documents", {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }).notNull().unique(),
    
    content: jsonb("content").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// New table to store chart thumbnail URLs
export const chartThumbnails = pgTable("chart_thumbnails", {
    id: uuid("id").primaryKey().defaultRandom(),
    chartId: uuid("chart_id").references(() => charts.id, { onDelete: "cascade" }).notNull(),
    url: varchar("url", { length: 2048 }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Generate types from schema
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;

export type Chart = typeof charts.$inferSelect;
export type NewChart = typeof charts.$inferInsert;

export type Config = typeof configs.$inferSelect;
export type NewConfig = typeof configs.$inferInsert;

export type ChartConfigLink = typeof chartConfigLinks.$inferSelect;
export type NewChartConfigLink = typeof chartConfigLinks.$inferInsert;

export type Annotation = typeof annotations.$inferSelect;
export type NewAnnotation = typeof annotations.$inferInsert;

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;

export type HeatmapChart = Omit<Chart, 'data'> & {
    data: HeatmapData;
};

// Specific chart config types
export type LensConfig = Omit<Config, 'data'> & {
    data: LensConfigData;
};

export type ChartThumbnail = typeof chartThumbnails.$inferSelect;
export type NewChartThumbnail = typeof chartThumbnails.$inferInsert;