import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env" });

const localConfig = {
  schema: "./src/db/schema.sqlite.ts",
  out: "./sqlite-migrations",
  dialect: "sqlite" as const,
  dbCredentials: {
    url: process.env.LOCAL_SQLITE_URL!,
  },
};

const supabaseConfig = {
  schema: "./src/db/schema.pg.ts",
  out: "./pg-migrations",
  dialect: "postgresql" as const,
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
};

const dbConfig = process.env.NEXT_PUBLIC_LOCAL_DB === "true" ? localConfig : supabaseConfig;

export default defineConfig(dbConfig);
