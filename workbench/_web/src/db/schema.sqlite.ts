import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import type { LensConfigData } from "@/types/lens";

// Helper function to generate UUIDs for SQLite
const generateUUID = () => {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
};

export const workspaces = sqliteTable("workspaces", {
    id: text("id").primaryKey().$defaultFn(generateUUID),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    public: integer("public", { mode: "boolean" }).default(false).notNull(),
});

export const chartTypes = ["line", "heatmap"] as const;

export const charts = sqliteTable("charts", {
    id: text("id").primaryKey().$defaultFn(generateUUID),
    workspaceId: text("workspace_id").notNull(),

    name: text("name").notNull().default("Untitled Chart"),
    data: text("data", { mode: "json" }), // JSON stored as text in SQLite

    type: text("type"),
    createdAt: integer("created_at", { mode: "timestamp" })
        .$defaultFn(() => new Date())
        .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
        .$defaultFn(() => new Date())
        .notNull()
        .$onUpdate(() => new Date()),
});

export const configTypes = ["lens", "patch"] as const;

export const configs = sqliteTable("configs", {
    id: text("id").primaryKey().$defaultFn(generateUUID),
    workspaceId: text("workspace_id").notNull(),
    data: text("data", { mode: "json" }).notNull(), // JSON stored as text in SQLite
    type: text("type").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
        .$defaultFn(() => new Date())
        .notNull(),
});

export const chartConfigLinks = sqliteTable("chart_config_links", {
    id: text("id").primaryKey().$defaultFn(generateUUID),
    chartId: text("chart_id").notNull(),
    configId: text("config_id").notNull(),
});

export const views = sqliteTable("views", {
    id: text("id").primaryKey().$defaultFn(generateUUID),
    chartId: text("chart_id").notNull(),
    data: text("data", { mode: "json" }).notNull(), // JSON stored as text in SQLite
});

export const documents = sqliteTable("documents", {
    id: text("id").primaryKey().$defaultFn(generateUUID),
    workspaceId: text("workspace_id").notNull(),
    content: text("content", { mode: "json" }).notNull(), // JSON stored as text in SQLite
    createdAt: integer("created_at", { mode: "timestamp" })
        .$defaultFn(() => new Date())
        .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
        .$defaultFn(() => new Date())
        .notNull()
        .$onUpdate(() => new Date()),
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

export type View = typeof views.$inferSelect;
export type NewView = typeof views.$inferInsert;
