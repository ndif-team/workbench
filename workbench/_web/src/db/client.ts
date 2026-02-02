/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import { config } from "dotenv";

config({ path: ".env" });

let database: any;
let sqliteClient: any = null; // Store the raw SQLite client for test utilities

// Detect if running under Bun
const isBun = typeof globalThis.Bun !== "undefined";

if (process.env.NEXT_PUBLIC_LOCAL_DB === "true") {
    const sqliteUrl = process.env.LOCAL_SQLITE_URL;
    
    if (isBun) {
        // Use Bun's native SQLite for better compatibility in tests
        const { Database } = require("bun:sqlite");
        const { drizzle } = require("drizzle-orm/bun-sqlite");
        sqliteClient = new Database(sqliteUrl);
        database = drizzle(sqliteClient);
    } else {
        // Use better-sqlite3 for Node.js (Next.js production/dev)
        const Database = require("better-sqlite3");
        const { drizzle } = require("drizzle-orm/better-sqlite3");
        sqliteClient = new Database(sqliteUrl);
        database = drizzle(sqliteClient);
    }
} else {
    const { drizzle } = require("drizzle-orm/postgres-js");
    const postgres = require("postgres");

    const connectionString = process.env.DATABASE_URL!;
    const client = postgres(connectionString, { prepare: false });
    database = drizzle({ client });
}

export const db = database;

// Export a function to initialize the database schema (for tests)
export const initializeSchema = async () => {
    if (process.env.NEXT_PUBLIC_LOCAL_DB !== "true" || !sqliteClient) return;
    
    const createTableStatements = `
        CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            public INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS charts (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            name TEXT NOT NULL DEFAULT 'Untitled Chart',
            data TEXT,
            type TEXT,
            view TEXT,
            created_at INTEGER NOT NULL DEFAULT (unixepoch()),
            updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE TABLE IF NOT EXISTS configs (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            data TEXT NOT NULL,
            type TEXT NOT NULL,
            created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE TABLE IF NOT EXISTS chart_config_links (
            id TEXT PRIMARY KEY,
            chart_id TEXT NOT NULL,
            config_id TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS views (
            id TEXT PRIMARY KEY,
            chart_id TEXT NOT NULL,
            data TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at INTEGER NOT NULL DEFAULT (unixepoch()),
            updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
    `;
    
    sqliteClient.exec(createTableStatements);
};

// Export a function to clear all tables (for tests)
export const clearDatabase = async () => {
    if (process.env.NEXT_PUBLIC_LOCAL_DB !== "true" || !sqliteClient) return;
    
    const clearStatements = `
        DELETE FROM chart_config_links;
        DELETE FROM views;
        DELETE FROM documents;
        DELETE FROM configs;
        DELETE FROM charts;
        DELETE FROM workspaces;
    `;
    
    sqliteClient.exec(clearStatements);
};
