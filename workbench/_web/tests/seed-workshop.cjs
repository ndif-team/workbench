/**
 * Seeds local.db with two deterministic workshops so the join-flow E2E can
 * exercise /w/[slug] WITHOUT an admin session:
 *
 *   - an active one (lens2 only, gpt2, starter prompt, far-future expiry)
 *   - an expired one (same shape, past expiry)
 *
 *   node tests/seed-workshop.cjs
 *
 * Fixed slugs let the spec navigate straight to the join links. Prior
 * participant workspaces for these workshops are deleted so each run
 * exercises the fresh-join path (idempotent across retries).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Database = require("better-sqlite3");

const DB_PATH = process.env.LOCAL_SQLITE_URL || "./local.db";

const ACTIVE_ID = "44444444-4444-4444-8444-444444444444";
const EXPIRED_ID = "55555555-5555-4555-8555-555555555555";
const ACTIVE_SLUG = "e2e-workshop-active-0001";
const EXPIRED_SLUG = "e2e-workshop-expired-001";

// gpt2 is the model the E2E backend warms in global setup.
const MODEL = "openai-community/gpt2";
const STARTER_PROMPT = "The Eiffel Tower is in";

const db = new Database(DB_PATH);

// drizzle's sqlite `timestamp` mode stores SECONDS; writing ms here would
// parse as a far-future date and break the expiry comparison.
const nowSec = Math.floor(Date.now() / 1000);
const inAWeek = nowSec + 7 * 24 * 3600;
const anHourAgo = nowSec - 3600;

// Clear prior seeds AND any participant workspaces they minted, so re-runs
// exercise the fresh-join path rather than the idempotent-rejoin path.
const staleWorkspaces = db
    .prepare("SELECT id FROM workspaces WHERE workshop_id IN (?, ?)")
    .all(ACTIVE_ID, EXPIRED_ID)
    .map((r) => r.id);
for (const wsId of staleWorkspaces) {
    db.prepare("DELETE FROM lens_runs WHERE workspace_id = ?").run(wsId);
    const chartIds = db
        .prepare("SELECT id FROM charts WHERE workspace_id = ?")
        .all(wsId)
        .map((r) => r.id);
    for (const chartId of chartIds) {
        db.prepare("DELETE FROM chart_config_links WHERE chart_id = ?").run(chartId);
        db.prepare("DELETE FROM views WHERE chart_id = ?").run(chartId);
    }
    db.prepare("DELETE FROM charts WHERE workspace_id = ?").run(wsId);
    db.prepare("DELETE FROM configs WHERE workspace_id = ?").run(wsId);
    db.prepare("DELETE FROM documents WHERE workspace_id = ?").run(wsId);
    db.prepare("DELETE FROM workspaces WHERE id = ?").run(wsId);
}
db.prepare("DELETE FROM workshops WHERE id IN (?, ?)").run(ACTIVE_ID, EXPIRED_ID);

const insert = db.prepare(
    `INSERT INTO workshops
        (id, name, slug, allowed_tools, model, starter_prompt, expires_at, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

insert.run(
    ACTIVE_ID,
    "E2E Active Workshop",
    ACTIVE_SLUG,
    JSON.stringify(["lens2"]),
    MODEL,
    STARTER_PROMPT,
    inAWeek,
    "e2e@seed.local",
    nowSec,
    nowSec,
);

insert.run(
    EXPIRED_ID,
    "E2E Expired Workshop",
    EXPIRED_SLUG,
    JSON.stringify(["lens2"]),
    MODEL,
    STARTER_PROMPT,
    anHourAgo,
    "e2e@seed.local",
    nowSec,
    nowSec,
);

db.close();
console.log(
    `Seeded workshops into ${DB_PATH}: active=/w/${ACTIVE_SLUG} expired=/w/${EXPIRED_SLUG}`,
);
