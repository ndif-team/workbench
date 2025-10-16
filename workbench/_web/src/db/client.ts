/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import { config } from "dotenv";

config({ path: ".env" });

let database: any;

if (process.env.NEXT_PUBLIC_LOCAL_DB === "true") {
  const Database = require("better-sqlite3");
  const { drizzle } = require("drizzle-orm/better-sqlite3");

  const sqliteUrl = process.env.LOCAL_SQLITE_URL;
  const client = new Database(sqliteUrl);
  database = drizzle(client);
} else {
  const { drizzle } = require("drizzle-orm/postgres-js");
  const postgres = require("postgres");

  const connectionString = process.env.DATABASE_URL!;
  const client = postgres(connectionString, { prepare: false });
  database = drizzle({ client });
}

export const db = database;
