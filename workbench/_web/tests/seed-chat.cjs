/**
 * Seeds the E2E SQLite DB with a deterministic Logit Lens (lens2) chart so the
 * chat handoff spec can exercise the "send a chat result back into the Logit
 * Lens" flow WITHOUT a model run / NDIF.
 *
 *   node tests/seed-chat.cjs
 *
 * The chart is created with an EMPTY prompt on a hot model (gpt2) so the page
 * renders the editable controls immediately and never auto-runs a lens job —
 * the handoff then drops captured chat text straight into the prompt editor.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Database = require("better-sqlite3");

const DB_PATH = process.env.LOCAL_SQLITE_URL || "./local.db";

const WS_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHART_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CONFIG_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const LINK_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const MODEL = "openai-community/gpt2";

const configData = { prompt: "", model: MODEL, topk: 5, includeEntropy: true };

const db = new Database(DB_PATH);
const now = Date.now();

db.prepare("DELETE FROM chart_config_links WHERE chart_id = ?").run(CHART_ID);
db.prepare("DELETE FROM configs WHERE id = ?").run(CONFIG_ID);
db.prepare("DELETE FROM charts WHERE id = ?").run(CHART_ID);
db.prepare("DELETE FROM workspaces WHERE id = ?").run(WS_ID);

db.prepare(
    "INSERT INTO workspaces (id, user_id, name, public, updated_at) VALUES (?, ?, ?, ?, ?)",
).run(WS_ID, "dev@localhost", "E2E Chat", 0, now);

// data = null so hasData is false and no lens result renders (no NDIF needed).
db.prepare(
    "INSERT INTO charts (id, workspace_id, name, data, type, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
).run(CHART_ID, WS_ID, "Chat Handoff", null, "lens2", 0, now, now);

db.prepare(
    "INSERT INTO configs (id, workspace_id, data, type, created_at) VALUES (?, ?, ?, ?, ?)",
).run(CONFIG_ID, WS_ID, JSON.stringify(configData), "lens2", now);

db.prepare("INSERT INTO chart_config_links (id, chart_id, config_id) VALUES (?, ?, ?)").run(
    LINK_ID,
    CHART_ID,
    CONFIG_ID,
);

console.log(`Seeded workspace ${WS_ID}, lens2 chart ${CHART_ID} -> ${DB_PATH}`);
db.close();
