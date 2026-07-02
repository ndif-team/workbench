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

// Second chart: a source+target pair with a persisted intervention + patched
// result, so the E2E can exercise the full activation-patching view (result
// grid, auto-scroll, patched-cell styling) via the restore path — no NDIF.
const PATCHED_CHART_ID = "22222222-2222-4222-8222-222222222223";
const PATCHED_RUN_ID = "44444444-4444-4444-8444-444444444444";

// Third chart: an identical clone of the first, used ONLY by the F1
// history-restore test. Restoring a strip PERSISTS onto the chart row
// (prompts + activeLensRunId), so giving the mutating test its own chart
// keeps the other specs (and the Argos screenshots) deterministic under
// fullyParallel workers.
const HISTORY_CHART_ID = "22222222-2222-4222-8222-222222222224";
const HISTORY_RUN_PREFIX = "55555555-5555-4555-8555-55555555555";

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
function buildLensData(finalToken, tokens = TOKENS) {
    const input = tokens.slice();
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

// --history-only: reset ONLY the F1 chart (and its runs). The F1 restore test
// mutates its chart row, so it reseeds itself before each attempt — scoped to
// its own chart so a reseed can never yank shared charts out from under the
// other specs running in parallel workers (the full seed runs once, in
// tests/global-setup.ts, before any worker starts).
const historyOnly = process.argv.includes("--history-only");

const db = new Database(DB_PATH);
// Serialize concurrent writers (e.g. an F1 retry reseeding while another
// worker reads): wait out a peer's transaction instead of throwing
// SQLITE_BUSY, and make the whole DELETE-then-INSERT atomic so a half-seeded
// state is never visible (racing DELETE/INSERT threw UNIQUE constraint
// failures on lens_runs.id).
db.pragma("busy_timeout = 15000");
db.exec("BEGIN IMMEDIATE");
const now = Date.now();

db.exec("DELETE FROM lens_runs WHERE chart_id = '" + HISTORY_CHART_ID + "'");
db.prepare("DELETE FROM charts WHERE id = ?").run(HISTORY_CHART_ID);
if (!historyOnly) {
    db.exec("DELETE FROM lens_runs WHERE chart_id = '" + CHART_ID + "'");
    db.exec("DELETE FROM lens_runs WHERE chart_id = '" + PATCHED_CHART_ID + "'");
    db.prepare("DELETE FROM charts WHERE id = ?").run(CHART_ID);
    db.prepare("DELETE FROM charts WHERE id = ?").run(PATCHED_CHART_ID);
    db.prepare("DELETE FROM workspaces WHERE id = ?").run(WS_ID);

    db.prepare(
        "INSERT INTO workspaces (id, user_id, name, public, updated_at) VALUES (?, ?, ?, ?, ?)",
    ).run(WS_ID, "dev@localhost", "E2E Patch Lens", 0, now);

    db.prepare(
        "INSERT INTO charts (id, workspace_id, name, data, type, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(CHART_ID, WS_ID, "Eiffel Tower", JSON.stringify(chartData), "patch-lens", 0, now, now);
}

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
    if (!historyOnly) {
        insRun.run(
            v.id,
            WS_ID,
            CHART_ID,
            MODEL,
            JSON.stringify(summary),
            JSON.stringify(data),
            now + i * 1000,
        );
    }
    // Mirror the same history onto the F1-only chart (distinct run ids).
    insRun.run(
        `${HISTORY_RUN_PREFIX}${i + 1}`,
        WS_ID,
        HISTORY_CHART_ID,
        MODEL,
        JSON.stringify(summary),
        JSON.stringify(data),
        now + i * 1000,
    );
});

// The F1-only clone of the first chart (see HISTORY_CHART_ID above).
db.prepare(
    "INSERT INTO charts (id, workspace_id, name, data, type, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
).run(
    HISTORY_CHART_ID,
    WS_ID,
    "Eiffel Tower (history)",
    JSON.stringify({ ...chartData, activeLensRunId: `${HISTORY_RUN_PREFIX}3` }),
    "patch-lens",
    2,
    now,
    now,
);

if (historyOnly) {
    db.exec("COMMIT");
    console.log(
        `Reseeded history chart ${HISTORY_CHART_ID} (${versions.length} run rows) -> ${DB_PATH}`,
    );
    db.close();
    process.exit(0);
}

// ---------------------------------------------------------------------------
// Patched chart: source + target + a persisted intervention whose patched
// heatmap is stored on the run row. PatchLensDisplay restores this as a
// controlled result, so the explorer renders the full intervention view
// (cone, arrow, result grid + sidebar) straight from the DB.
const SRC_TOKENS = ["The", " Eiffel", " Tower", " is", " in", " the", " city", " of"];
const TGT_TOKENS = ["The", " Big", " Ben", " is", " in", " the", " city", " of"];
// Layer 8 stays visible at Layer Step 8 (the spec pins steps via the toolbar);
// the last token position is always rendered regardless of token step.
const INTERVENTION = { srcTokenPos: 7, srcLayer: 8, tgtTokenPos: 7, tgtLayer: 8 };

function promptSummary(tokens, finalToken) {
    const cells = LAYERS.map((li) => ({
        token: li > N_LAYERS / 2 ? finalToken : " the",
        prob: Math.round((0.15 + (0.8 * li) / (N_LAYERS - 1)) * 1000) / 1000,
    }));
    return {
        prompt: tokens.join(""),
        finalToken,
        lastRow: { layers: LAYERS, cells },
    };
}

const patchedChartData = {
    sourcePrompt: SRC_TOKENS.join(""),
    targetPrompt: TGT_TOKENS.join(""),
    lastRunSourcePrompt: SRC_TOKENS.join(""),
    lastRunTargetPrompt: TGT_TOKENS.join(""),
    intervention: INTERVENTION,
    activeLensRunId: PATCHED_RUN_ID,
};

db.prepare(
    "INSERT INTO charts (id, workspace_id, name, data, type, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
).run(
    PATCHED_CHART_ID,
    WS_ID,
    "Eiffel vs Big Ben (patched)",
    JSON.stringify(patchedChartData),
    "patch-lens",
    1,
    now,
    now,
);

const patchedSummary = {
    source: promptSummary(SRC_TOKENS, " Paris"),
    target: promptSummary(TGT_TOKENS, " London"),
    intervention: INTERVENTION,
    // The classic outcome: the patched target now predicts the source answer.
    interventionResult: promptSummary(TGT_TOKENS, " Paris"),
    params: { topk: 10, includeEntropy: true },
};
const patchedData = {
    source: buildLensData(" Paris", SRC_TOKENS),
    target: buildLensData(" London", TGT_TOKENS),
    interventionResult: buildLensData(" Paris", TGT_TOKENS),
};
insRun.run(
    PATCHED_RUN_ID,
    WS_ID,
    PATCHED_CHART_ID,
    MODEL,
    JSON.stringify(patchedSummary),
    JSON.stringify(patchedData),
    now,
);

db.exec("COMMIT");
// Run rows: versions on the main chart + their history-chart mirrors + the
// patched run.
console.log(
    `Seeded workspace ${WS_ID}, charts ${CHART_ID} + ${PATCHED_CHART_ID} + ${HISTORY_CHART_ID} (patch-lens), ${versions.length * 2 + 1} run rows -> ${DB_PATH}`,
);
db.close();
