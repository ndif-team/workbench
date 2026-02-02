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

// Export a function to clear all tables (for tests)
// Schema is created by drizzle-kit push in the test setup
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
