import {
    boolean,
    jsonb,
    pgTable,
    varchar,
    uuid,
    timestamp,
    real,
    uniqueIndex,
    index,
} from "drizzle-orm/pg-core";
import type { ConfigData, ChartData, ChartView } from "@/types/charts";
import type { LensConfigData } from "@/types/lens";
import type { LensRunSummary, LensRunHeatmaps } from "@/types/lensRun";
import type { ProlificParams } from "@/lib/prolific";
import type { TutorialEventPayload, TutorialEventType } from "@/types/tutorialEvents";
import type { TutorialContent } from "@/types/tutorial-content";

export const workshopTools = ["lens2", "activation-patching", "patch-lens"] as const;
export type WorkshopTool = (typeof workshopTools)[number];

// Tutorial = the guided-activity content a workshop runs (the 7-unit Prolific
// tutorial and any future variants). Content lives in `data` (jsonb) so copy,
// prompts, hints, and checks are editable through the workshop admin UI without
// a code change. Workshops reference one tutorial; a null reference falls back
// to the seeded demo tutorial.
export const tutorials = pgTable("tutorials", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 256 }).notNull(),
    slug: varchar("slug", { length: 64 }).notNull().unique(),
    data: jsonb("data").$type<TutorialContent>().notNull(),
    createdBy: varchar("created_by", { length: 256 }).notNull().default(""),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
        .defaultNow()
        .notNull()
        .$onUpdate(() => new Date()),
});

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
    // The guided tutorial this workshop runs. Null → the seeded demo tutorial.
    tutorialId: uuid("tutorial_id").references(() => tutorials.id, { onDelete: "set null" }),
    // Where a participant is sent after finishing the tutorial. The survey (not
    // the tool) issues the Prolific completion code, so the finish screen links
    // here instead of showing a code.
    surveyUrl: varchar("survey_url", { length: 2048 }).notNull().default(""),
    // Legacy: per-workshop finish text. Retired from the finish flow in favor of
    // surveyUrl; kept as optional thank-you copy for backwards compatibility.
    completionText: varchar("completion_text", { length: 4096 }).notNull().default(""),
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
        createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
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

// Append-only tutorial telemetry: one row per participant event during the
// Prolific tutorial (step_started/completed, hint_shown, observation_submitted,
// check_answered). Cascades through workspace like lens_runs; funnels and hint
// counts are derived at query time. App DB only — never PostHog.
export const tutorialEvents = pgTable(
    "tutorial_events",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        workspaceId: uuid("workspace_id")
            .references(() => workspaces.id, { onDelete: "cascade" })
            .notNull(),
        stepId: varchar("step_id", { length: 64 }).notNull(),
        eventType: varchar("event_type", { length: 32 }).$type<TutorialEventType>().notNull(),
        payload: jsonb("payload").$type<TutorialEventPayload>(),
        createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    },
    (table) => [
        index("tutorial_events_workspace_created_idx").on(table.workspaceId, table.createdAt),
    ],
);

// Generate types from schema
export type Tutorial = typeof tutorials.$inferSelect;
export type NewTutorial = typeof tutorials.$inferInsert;

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

export type TutorialEvent = typeof tutorialEvents.$inferSelect;
export type NewTutorialEvent = typeof tutorialEvents.$inferInsert;
