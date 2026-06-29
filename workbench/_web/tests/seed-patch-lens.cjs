/**
 * Seeds local.db with a deterministic patch-lens chart + prompt history so the
 * UI E2E (B1/F1) can exercise the heatmap and the history rail WITHOUT a model
 * run / NDIF. Run under node before Playwright.
 *
 *   node tests/seed-patch-lens.cjs
 *
 * Fixed IDs let the spec navigate straight to the chart.
 */
// Load .env so DB_PATH matches the DB the app server reads (LOCAL_SQLITE_URL =
// ./e2e.db in CI, ./local.db locally). Without this the seed defaults to
// ./local.db while the server reads ./e2e.db, leaving the E2E with no data.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Database = require("better-sqlite3");

const DB_PATH = process.env.LOCAL_SQLITE_URL || "./local.db";
const WS_ID = "11111111-1111-4111-8111-111111111111";
const CHART_ID = "22222222-2222-4222-8222-222222222222";
const MODEL = "meta-llama/Llama-3.1-8B";

// The newest run id — the chart's activeLensRunId points here.
const NEWEST_RUN_ID = "33333333-3333-4333-8333-333333333333";

// A 12-token prompt over 32 layers — big enough that the OLD auto-fit clipped
// the final row at a constrained viewport height (the B1 condition).
const TOKENS = [
    "The",
    " Eiffel",
    " Tower",
    " is",
    " in",
    " the",
    " city",
    " of",
    " Rome",
    " not",
    " Paris",
    ":",
];
const N_LAYERS = 32;
const LAYERS = Array.from({ length: N_LAYERS }, (_, i) => i);

// Build nnsightful-shaped LogitLensData: input, layers, tracked, topk.
// For each position, a couple of candidate tokens with per-layer probabilities
// that ramp toward the final layer (so cells have visible color).
function buildLensData(finalToken) {
    const input = TOKENS.slice();
    const topk = LAYERS.map((li) =>
        input.map((_, pos) => {
            const cand =
                pos === input.length - 1
                    ? [finalToken, " the"]
                    : [input[(pos + 1) % input.length], " a"];
            return cand;
        }),
    );
    const tracked = input.map((_, pos) => {
        const cand =
            pos === input.length - 1
                ? [finalToken, " the"]
                : [input[(pos + 1) % input.length], " a"];
        const map = {};
        for (const tok of cand) {
            map[tok] = LAYERS.map((li) => {
                const base = tok === cand[0] ? 0.2 + (0.7 * li) / (N_LAYERS - 1) : 0.1;
                return Math.round(base * 1000) / 1000;
            });
        }
        return map;
    });
    return {
        meta: { version: 2, timestamp: "seed", model: MODEL },
        layers: LAYERS,
        input,
        tracked,
        topk,
        entropy: null,
        positions: input.map((_, i) => i),
    };
}

// Chart row no longer stores heatmaps — the display fetches them via activeLensRunId.
const chartData = {
    sourcePrompt: TOKENS.join(""),
    targetPrompt: "",
    lastRunSourcePrompt: TOKENS.join(""),
    activeLensRunId: NEWEST_RUN_ID,
};

const db = new Database(DB_PATH);
const now = Date.now();

db.exec("DELETE FROM lens_runs WHERE chart_id = '" + CHART_ID + "'");
db.prepare("DELETE FROM charts WHERE id = ?").run(CHART_ID);
db.prepare("DELETE FROM workspaces WHERE id = ?").run(WS_ID);

db.prepare(
    "INSERT INTO workspaces (id, user_id, name, public, updated_at) VALUES (?, ?, ?, ?, ?)",
).run(WS_ID, "dev@localhost", "E2E Patch Lens", 0, now);

db.prepare(
    "INSERT INTO charts (id, workspace_id, name, data, type, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
).run(CHART_ID, WS_ID, "Eiffel Tower", JSON.stringify(chartData), "patch-lens", 0, now, now);

// Three history entries (successive prompt versions) with distinct timestamps.
const insRun = db.prepare(
    "INSERT INTO lens_runs (id, workspace_id, chart_id, model, summary, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
);
const versions = [
    {
        id: "33333333-3333-4333-8333-333333333331",
        prompt: "The Eiffel Tower is in the city of",
        tok: " Paris",
    },
    {
        id: "33333333-3333-4333-8333-333333333332",
        prompt: "The Eiffel Tower is in the city of Rome,",
        tok: " Rome",
    },
    { id: NEWEST_RUN_ID, prompt: TOKENS.join(""), tok: " Paris" },
];
versions.forEach((v, i) => {
    const cells = LAYERS.map((li) => ({
        token: li > N_LAYERS / 2 ? v.tok : " the",
        prob: Math.round((0.15 + (0.8 * li) / (N_LAYERS - 1)) * 1000) / 1000,
    }));
    const summary = {
        source: {
            prompt: v.prompt,
            finalToken: v.tok,
            lastRow: { layers: LAYERS, cells },
        },
        params: { topk: 10, includeEntropy: true },
    };
    const data = { source: buildLensData(v.tok) };
    insRun.run(
        v.id,
        WS_ID,
        CHART_ID,
        MODEL,
        JSON.stringify(summary),
        JSON.stringify(data),
        now + i * 1000,
    );
});

console.log(
    `Seeded workspace ${WS_ID}, chart ${CHART_ID} (patch-lens), ${versions.length} history rows -> ${DB_PATH}`,
);
db.close();
