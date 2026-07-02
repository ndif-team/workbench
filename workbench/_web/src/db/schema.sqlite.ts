import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import type { LensConfigData } from "@/types/lens";
import type { LensRunSummary, LensRunHeatmaps } from "@/types/lensRun";

// Helper function to generate UUIDs for SQLite
const generateUUID = () => {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
};

export const workshopTools = ["lens2", "activation-patching", "patch-lens"] as const;
export type WorkshopTool = (typeof workshopTools)[number];

// Workshop = a shareable join link (/w/{slug}) plus the constraints applied to
// workspaces created through it. Mirrors the pg table; see schema.pg.ts.
export const workshops = sqliteTable("workshops", {
    id: text("id").primaryKey().$defaultFn(generateUUID),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    allowedTools: text("allowed_tools", { mode: "json" }).$type<WorkshopTool[]>().notNull(),
    model: text("model").notNull(),
    starterPrompt: text("starter_prompt").notNull().default(""),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
        .$defaultFn(() => new Date())
        .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
        .$defaultFn(() => new Date())
        .notNull()
        .$onUpdate(() => new Date()),
});

export const workspaces = sqliteTable("workspaces", {
    id: text("id").primaryKey().$defaultFn(generateUUID),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    public: integer("public", { mode: "boolean" }).default(false).notNull(),
    workshopId: text("workshop_id"),
    updatedAt: integer("updated_at", { mode: "timestamp" })
        .$defaultFn(() => new Date())
        .notNull()
        .$onUpdate(() => new Date()),
});

export const chartTypes = ["line", "heatmap"] as const;

export const charts = sqliteTable("charts", {
    id: text("id").primaryKey().$defaultFn(generateUUID),
    workspaceId: text("workspace_id").notNull(),

    name: text("name").notNull().default("Untitled Chart"),
    data: text("data", { mode: "json" }), // JSON stored as text in SQLite

    type: text("type"),
    position: real("position").default(0).notNull(),
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
    position: real("position").default(0).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
        .$defaultFn(() => new Date())
        .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
        .$defaultFn(() => new Date())
        .notNull()
        .$onUpdate(() => new Date()),
});

// F1 prompt history: one row per successful patch-lens lens run. Mirrors the
// plain-column convention of the other sqlite tables (no FK refs; the pg
// mirror carries the cascade). Split storage: `summary` is the compact slice
// the rail lists; `data` holds the full per-prompt heatmaps, fetched on demand.
export const lensRuns = sqliteTable("lens_runs", {
    id: text("id").primaryKey().$defaultFn(generateUUID),
    workspaceId: text("workspace_id").notNull(),
    chartId: text("chart_id").notNull(),
    model: text("model").notNull(),
    summary: text("summary", { mode: "json" }).$type<LensRunSummary>().notNull(),
    data: text("data", { mode: "json" }).$type<LensRunHeatmaps>().notNull(),
    // Millisecond precision (not the table-default seconds): runs land in bursts
    // within one second, and ordering + the retention prune both rely on
    // createdAt to break ties (random-UUID ids can't). pg's timestamp already
    // has sub-second precision, so only the sqlite mirror needs this.
    createdAt: integer("created_at", { mode: "timestamp_ms" })
        .$defaultFn(() => new Date())
        .notNull(),
});

// Generate types from schema
export type Workshop = typeof workshops.$inferSelect;
export type NewWorkshop = typeof workshops.$inferInsert;

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

export type LensRun = typeof lensRuns.$inferSelect;
export type NewLensRun = typeof lensRuns.$inferInsert;
