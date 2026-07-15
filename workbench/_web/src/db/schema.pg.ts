import {
    boolean,
    jsonb,
    pgTable,
    varchar,
    uuid,
    timestamp,
    real,
    uniqueIndex,
} from "drizzle-orm/pg-core";
import type { ConfigData, ChartData, ChartView } from "@/types/charts";
import type { LensConfigData } from "@/types/lens";
import type { LensRunSummary, LensRunHeatmaps } from "@/types/lensRun";
import type { ProlificParams } from "@/lib/prolific";

export const workshopTools = ["lens2", "activation-patching", "patch-lens"] as const;
export type WorkshopTool = (typeof workshopTools)[number];

// Workshop = a shareable join link (/w/{slug}) plus the constraints applied to
// workspaces created through it: which tools participants can use, the model
// their charts are pinned to, and a starter prompt seeded into the first chart.
// After expiresAt the join link stops minting users; existing participant
// workspaces are untouched.
export const workshops = pgTable("workshops", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 256 }).notNull(),
    slug: varchar("slug", { length: 64 }).notNull().unique(),
    allowedTools: jsonb("allowed_tools").$type<WorkshopTool[]>().notNull(),
    model: varchar("model", { length: 256 }).notNull(),
    starterPrompt: varchar("starter_prompt", { length: 2048 }).notNull().default(""),
    // When true the workshop model is only the participant's default; they may
    // switch models. When false (default) the model is locked to the workshop's.
    allowModelChange: boolean("allow_model_change").notNull().default(false),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    createdBy: varchar("created_by", { length: 256 }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
        .defaultNow()
        .notNull()
        .$onUpdate(() => new Date()),
});

export const workspaces = pgTable(
    "workspaces",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: varchar("user_id", { length: 256 }).notNull(),
        name: varchar("name", { length: 256 }).notNull(),
        public: boolean("public").default(false).notNull(),
        workshopId: uuid("workshop_id").references(() => workshops.id, { onDelete: "set null" }),
        // Prolific study identifiers captured from the join-link query params on
        // first arrival, retained for matching runs back to the study. Null for
        // normal (non-workshop) workspaces and workshop joins without Prolific.
        prolific: jsonb("prolific").$type<ProlificParams>(),
        updatedAt: timestamp("updated_at", { mode: "date" })
            .defaultNow()
            .notNull()
            .$onUpdate(() => new Date()),
    },
    // One workspace per (participant, workshop): makes concurrent join-link
    // clicks converge on a single workspace instead of racing check-then-act.
    // NULL workshopId rows (normal workspaces) are unconstrained — both pg and
    // sqlite treat NULLs as distinct in unique indexes.
    (table) => [uniqueIndex("workspaces_user_workshop_unique").on(table.userId, table.workshopId)],
);

export const chartTypes = ["line", "heatmap"] as const;

export const charts = pgTable("charts", {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
        .references(() => workspaces.id, { onDelete: "cascade" })
        .notNull(),

    name: varchar("name", { length: 256 }).notNull().default("Untitled Chart"),
    data: jsonb("data").$type<ChartData>(),

    type: varchar("type", { enum: chartTypes, length: 32 }),
    position: real("position").default(0).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
        .defaultNow()
        .notNull()
        .$onUpdate(() => new Date()),
});

export const configTypes = ["lens", "patch"] as const;

export const configs = pgTable("configs", {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
        .references(() => workspaces.id, { onDelete: "cascade" })
        .notNull(),

    data: jsonb("data").$type<ConfigData>().notNull(),
    type: varchar("type", { enum: configTypes, length: 32 }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const chartConfigLinks = pgTable("chart_config_links", {
    id: uuid("id").primaryKey().defaultRandom(),
    // NOTE: Unique key will constrain a 1:1 relationship. We can change this later if needed.
    chartId: uuid("chart_id")
        .references(() => charts.id, { onDelete: "cascade" })
        .notNull()
        .unique(),
    configId: uuid("config_id")
        .references(() => configs.id, { onDelete: "cascade" })
        .notNull()
        .unique(),
});

export const views = pgTable("views", {
    id: uuid("id").primaryKey().defaultRandom(),
    chartId: uuid("chart_id")
        .references(() => charts.id, { onDelete: "cascade" })
        .notNull()
        .unique(),
    data: jsonb("data").$type<ChartView>().notNull(),
});

export const documents = pgTable("documents", {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
        .references(() => workspaces.id, { onDelete: "cascade" })
        .notNull(),

    content: jsonb("content").notNull(),
    position: real("position").default(0).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
        .defaultNow()
        .notNull()
        .$onUpdate(() => new Date()),
});

// F1 prompt history: one row per successful patch-lens lens run; cascades through
// workspace/chart like configs. Split storage: `summary` is the compact slice
// the rail lists; `data` holds the full per-prompt heatmaps, fetched on demand.
export const lensRuns = pgTable("lens_runs", {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
        .references(() => workspaces.id, { onDelete: "cascade" })
        .notNull(),
    chartId: uuid("chart_id")
        .references(() => charts.id, { onDelete: "cascade" })
        .notNull(),
    model: varchar("model", { length: 256 }).notNull(),
    summary: jsonb("summary").$type<LensRunSummary>().notNull(),
    data: jsonb("data").$type<LensRunHeatmaps>().notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
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
