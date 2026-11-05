/**
 * Brings a local SQLite database from before the November 2026 upstream merge
 * up to the current schema, keeping its data. Run this BEFORE `drizzle-kit
 * push`: on such a database, push rebuilds the workspaces table and loses its
 * rows. Safe to run twice.
 *
 *     bun scripts/migrate-local-db.ts [path/to/local.db]
 */
import { Database } from "bun:sqlite";

const db = new Database(Bun.argv[2] ?? "local.db");
db.transaction(() => {
    const columns = db.query("pragma table_info(workspaces)").all() as { name: string }[];
    if (!columns.some((c) => c.name === "is_default")) {
        db.run("alter table workspaces add column is_default integer not null default false");
    }
    db.run(
        "create unique index if not exists workspaces_user_default_unique on workspaces (user_id) where is_default = 1",
    );
    if (db.query("select 1 from sqlite_master where name = 'views'").get()) {
        const { n } = db.query("select count(*) as n from views").get() as { n: number };
        if (n > 0) throw new Error("The views table has rows; move them before dropping it.");
        db.run("drop table views");
    }
})();
console.log("Migrated.");
