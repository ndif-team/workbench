import { boolean, jsonb, pgTable, varchar, uuid, timestamp } from "drizzle-orm/pg-core";
import type { ConfigData, ChartData, ChartView } from "@/types/charts";
import type { LensConfig } from "@/types/lens";

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  public: boolean("public").default(false).notNull(),
});

export const chartTypes = ["line", "heatmap"] as const;

export const charts = pgTable("charts", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),

  name: varchar("name", { length: 256 }).notNull().default("Untitled Chart"),
  data: jsonb("data").$type<ChartData>(),

  type: varchar("type", { enum: chartTypes, length: 32 }),
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
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .defaultNow()
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
