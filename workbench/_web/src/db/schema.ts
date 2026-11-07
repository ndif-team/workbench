import { sql, type AnyColumn } from "drizzle-orm";
import {
    workspaces as sqliteWorkspaces,
    charts as sqliteCharts,
    configs as sqliteConfigs,
    chartConfigLinks as sqliteChartConfigLinks,
    documents as sqliteDocuments,
    chats as sqliteChats,
    chatMessages as sqliteChatMessages,
    lensRuns as sqliteLensRuns,
    workshops as sqliteWorkshops,
    tutorials as sqliteTutorials,
    tutorialEvents as sqliteTutorialEvents,
} from "./schema.sqlite";
import {
    workspaces as pgWorkspaces,
    charts as pgCharts,
    configs as pgConfigs,
    chartConfigLinks as pgChartConfigLinks,
    documents as pgDocuments,
    chats as pgChats,
    chatMessages as pgChatMessages,
    lensRuns as pgLensRuns,
    workshops as pgWorkshops,
    tutorials as pgTutorials,
    tutorialEvents as pgTutorialEvents,
} from "./schema.pg";

// Conditionally export the appropriate schema based on environment
const isLocal = process.env.NEXT_PUBLIC_LOCAL_DB === "true";

export const workspaces = isLocal ? sqliteWorkspaces : pgWorkspaces;
export const charts = isLocal ? sqliteCharts : pgCharts;
export const configs = isLocal ? sqliteConfigs : pgConfigs;
export const chartConfigLinks = isLocal ? sqliteChartConfigLinks : pgChartConfigLinks;
export const documents = isLocal ? sqliteDocuments : pgDocuments;
export const chats = isLocal ? sqliteChats : pgChats;
export const chatMessages = isLocal ? sqliteChatMessages : pgChatMessages;
export const lensRuns = isLocal ? sqliteLensRuns : pgLensRuns;
export const workshops = isLocal ? sqliteWorkshops : pgWorkshops;
export const tutorials = isLocal ? sqliteTutorials : pgTutorials;
export const tutorialEvents = isLocal ? sqliteTutorialEvents : pgTutorialEvents;

/** A top-level string field of a JSON column as text: `->>` on Postgres jsonb, `json_extract` on SQLite's JSON text. */
export const jsonTextField = (column: AnyColumn, key: string) =>
    isLocal
        ? sql<string | null>`json_extract(${column}, ${`$.${key}`})`
        : sql<string | null>`${column}->>${key}`;

/**
 * Whether `id` has the shape of a row id (a UUID, in both schemas). Postgres
 * answers a malformed uuid with an error (22P02) rather than no row, so check
 * an id taken from a URL before querying by it.
 */
export const isUuid = (id: string): boolean =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

// Identical in both schema files; re-exported from one for a single import site.
export { workshopTools } from "./schema.pg";
export type { WorkshopTool } from "./schema.pg";

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

export type Chat = typeof pgChats.$inferSelect;
export type ChatMessage = typeof pgChatMessages.$inferSelect;

export type LensRun = typeof lensRuns.$inferSelect;
export type NewLensRun = typeof lensRuns.$inferInsert;

export type Workshop = typeof workshops.$inferSelect;
export type NewWorkshop = typeof workshops.$inferInsert;

export type Tutorial = typeof tutorials.$inferSelect;
export type NewTutorial = typeof tutorials.$inferInsert;

export type TutorialEvent = typeof tutorialEvents.$inferSelect;
export type NewTutorialEvent = typeof tutorialEvents.$inferInsert;
