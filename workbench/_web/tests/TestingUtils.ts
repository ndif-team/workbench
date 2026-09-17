/**
 * E2E testing utilities — our version of pawtograder's TestingUtils. Owns:
 *   - creating fresh Supabase Auth users via the service-role admin API,
 *   - magic-link login (drives the app's /auth/magic-link route so @supabase/ssr
 *     sets the session cookies — no cookie hand-encoding), with retries because
 *     generateLink/verifyOtp flake transiently under CI parallelism,
 *   - seeding workshop rows and a patch-lens chart via the service-role client
 *     (PostgREST exposes the drizzle `public` tables; the key bypasses RLS).
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY). Loaded from .env.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import dotenv from "dotenv";
import { E2E_MODEL } from "./fixtures";

dotenv.config({ path: ".env" });

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Whether this run talks to the local SQLite dev DB instead of Supabase, and
 * whether the app is short-circuiting auth to its stub user. CI sets neither and
 * gets the Supabase path below; the repo's committed `.env` sets both, which is
 * what lets the tutorial specs run on a laptop with nothing but `bun run dev`.
 */
const LOCAL_DB = process.env.NEXT_PUBLIC_LOCAL_DB === "true";
const AUTH_DISABLED = process.env.NEXT_PUBLIC_DISABLE_AUTH === "true";

/**
 * The user `src/lib/supabase/server.ts` returns when NEXT_PUBLIC_DISABLE_AUTH is
 * on. Seeding a workspace under this id is what makes the route's owner checks
 * pass without a Supabase session.
 */
const LOCAL_STUB_USER: TestingUser = {
    email: "dev@localhost",
    user_id: "local-dev-user",
};

/**
 * Service-role client — bypasses RLS; server-only key, never shipped to the browser.
 *
 * Constructed lazily behind a Proxy rather than at import time: `createClient`
 * throws on a missing url/key, and this module is imported by every spec, so an
 * eager client made the whole suite unloadable on a machine configured for the
 * local SQLite path (no Supabase keys in `.env`). Now the failure lands only on
 * the call that actually needs Postgres, with a message that says which env var
 * is missing.
 */
let serviceClient: SupabaseClient | null = null;
const serviceRoleClient = (): SupabaseClient => {
    if (!serviceClient) {
        if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
            throw new Error(
                "Supabase seeding needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY " +
                    "(this run has NEXT_PUBLIC_LOCAL_DB=" +
                    String(process.env.NEXT_PUBLIC_LOCAL_DB) +
                    ")",
            );
        }
        serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
            auth: { autoRefreshToken: false, persistSession: false },
        });
    }
    return serviceClient;
};
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
    get(_target, prop) {
        const client = serviceRoleClient() as unknown as Record<string | symbol, unknown>;
        const value = client[prop];
        // Bind so `supabase.from(...)` keeps its receiver — the proxy hands back
        // the method itself, which would otherwise be called with `this` unset.
        return typeof value === "function" ? value.bind(client) : value;
    },
});

export type TestingUser = { email: string; user_id: string };

/**
 * Create a fresh Supabase Auth user. Email is unique per worker+call unless one
 * is passed; `admin` uses E2E_ADMIN_EMAIL so the run's allowlisted admin address
 * (ADMIN_EMAILS in CI) resolves. Idempotent: reuses an existing account by email.
 */
export async function createTestUser(opts?: {
    email?: string;
    admin?: boolean;
}): Promise<TestingUser> {
    const worker = process.env.TEST_WORKER_INDEX ?? "0";
    const rand = Math.random().toString(36).slice(2, 12);
    const email =
        opts?.email ??
        (opts?.admin
            ? (process.env.E2E_ADMIN_EMAIL ?? "e2e-admin@workbench.test")
            : `e2e-user-${worker}-${rand}@workbench.test`);

    const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: `pw-${rand}-${Date.now()}`,
        email_confirm: true,
        app_metadata: { seeded: true },
    });
    if (!error && data.user) return { email, user_id: data.user.id };

    if (error && /registered|already|exists/i.test(error.message)) {
        const existing = await findUserByEmail(email);
        if (existing) return { email, user_id: existing.id };
    }
    throw new Error(`createTestUser(${email}) failed: ${error?.message ?? "unknown"}`);
}

async function findUserByEmail(email: string) {
    const target = email.toLowerCase();
    for (let page = 1; ; page++) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        const match = data.users.find((u) => u.email?.toLowerCase() === target);
        if (match) return match;
        if (data.users.length < 1000) return null;
    }
}

/**
 * admin.generateLink with backoff — GoTrue intermittently returns an empty-body
 * error under CI parallelism; treat any error/rejection as transient and retry.
 */
async function generateMagicLinkWithRetry(email: string) {
    const delaysMs = [500, 1500, 4000];
    let lastErr = "";
    for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
        try {
            const result = await supabase.auth.admin.generateLink({ email, type: "magiclink" });
            if (!result.error) return result;
            lastErr = result.error.message || "unknown";
            if (attempt === delaysMs.length) return result;
        } catch (err) {
            lastErr = err instanceof Error ? err.message : String(err);
            if (attempt === delaysMs.length) throw err;
        }
        await new Promise((r) =>
            setTimeout(r, delaysMs[attempt] + Math.floor(Math.random() * 250)),
        );
    }
    throw new Error(`generateMagicLinkWithRetry exhausted (${lastErr})`);
}

/** Absolute magic-link URL for manual verification (E2E drives the relative path directly). */
export async function generateMagicLink(user: TestingUser): Promise<string> {
    const { data, error } = await generateMagicLinkWithRetry(user.email);
    const tokenHash = data?.properties?.hashed_token;
    if (error || !tokenHash) {
        throw new Error(`generateMagicLink(${user.email}) failed: ${error?.message ?? "no token"}`);
    }
    const base = (process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
    return `${base}/auth/magic-link?token_hash=${encodeURIComponent(tokenHash)}`;
}

/**
 * Log `user` into the browser via the magic-link route. Retries with a clean
 * cookie slate + jittered backoff, since both generateLink and the verifyOtp
 * server action flake transiently under CI parallelism.
 */
export async function loginAsUser(page: Page, user: TestingUser, retries = 4): Promise<void> {
    const outcomes: string[] = [];
    for (let attempt = 0; attempt <= retries; attempt++) {
        if (attempt > 0) {
            try {
                await page.context().clearCookies();
            } catch {
                /* best effort */
            }
        }
        try {
            const { data, error } = await generateMagicLinkWithRetry(user.email);
            const tokenHash = data?.properties?.hashed_token;
            if (error || !tokenHash) {
                outcomes.push(`gen:${error?.message ?? "no-token"}`);
            } else {
                await page.goto(`/auth/magic-link?token_hash=${encodeURIComponent(tokenHash)}`);
                await page.getByRole("button", { name: /sign in with magic link/i }).click();
                // Success = the verifyOtp server action redirected us into the
                // workbench. On failure it bounces back to /auth/magic-link with
                // an ?error, so record that (or the current URL) and retry.
                try {
                    await page.waitForURL(/\/workbench(\/|$|\?)/, { timeout: 15_000 });
                    return;
                } catch {
                    const errText = await page
                        .locator('p[role="alert"]')
                        .first()
                        .textContent()
                        .catch(() => null);
                    outcomes.push(errText?.trim() || `no-redirect(${page.url()})`);
                }
            }
        } catch (err) {
            outcomes.push(`exception:${err instanceof Error ? err.message : String(err)}`);
        }
        if (attempt < retries) {
            await new Promise((r) =>
                setTimeout(r, 250 * (attempt + 1) + Math.floor(Math.random() * 250)),
            );
        }
    }
    throw new Error(
        `loginAsUser(${user.email}) failed after ${retries + 1} attempts: ${outcomes.join("; ")}`,
    );
}

/** A user-scoped supabase-js client (for assertions/seeding that must run AS the user). */
export async function createAuthenticatedClient(user: TestingUser): Promise<SupabaseClient> {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await generateMagicLinkWithRetry(user.email);
    const tokenHash = data?.properties?.hashed_token;
    if (error || !tokenHash) throw new Error(`auth client: ${error?.message ?? "no token"}`);
    const verified = await userClient.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
    if (verified.error || !verified.data.session) {
        throw new Error(
            `verifyOtp failed for ${user.email}: ${verified.error?.message ?? "no session"}`,
        );
    }
    await userClient.auth.setSession(verified.data.session);
    return userClient;
}

/**
 * The user the specs should own their fixtures as.
 *
 * With auth disabled there is exactly one identity the server will ever report
 * (`LOCAL_STUB_USER`), and asking GoTrue for another would fail — there is no
 * GoTrue. Under real auth this is `createTestUser`, unchanged.
 */
export async function createTestUserOrStub(opts?: {
    email?: string;
    admin?: boolean;
}): Promise<TestingUser> {
    if (AUTH_DISABLED) return LOCAL_STUB_USER;
    return createTestUser(opts);
}

/**
 * Log in, unless the app is already handing every request the stub user — in
 * which case /auth/magic-link has nothing to verify against and the browser is
 * authenticated by definition.
 */
export async function loginIfRequired(page: Page, user: TestingUser): Promise<void> {
    if (AUTH_DISABLED) return;
    await loginAsUser(page, user);
}

// ---------------------------------------------------------------------------
// Seeds (ported from tests/seed-*.cjs; write Postgres via the service client).
// ---------------------------------------------------------------------------

const MODEL = E2E_MODEL;
export const WORKSHOP_STARTER_PROMPT = "The Eiffel Tower is in";
export const ACTIVE_WORKSHOP_SLUG = "e2e-workshop-active-0001";
export const EXPIRED_WORKSHOP_SLUG = "e2e-workshop-expired-001";
const ACTIVE_WORKSHOP_ID = "44444444-4444-4444-8444-444444444444";
const EXPIRED_WORKSHOP_ID = "55555555-5555-4555-8555-555555555555";

/** Delete participant workspaces a workshop minted (cascades charts/lens_runs/etc.). */
async function clearWorkshopWorkspaces(workshopIds: string[]) {
    const { data } = await supabase.from("workspaces").select("id").in("workshop_id", workshopIds);
    const ids = (data ?? []).map((r: { id: string }) => r.id);
    if (ids.length) await supabase.from("workspaces").delete().in("id", ids);
}

/**
 * Seed an active + an expired workshop (fixed slugs so the join spec can navigate
 * straight in). Idempotent: clears prior seeds AND participant workspaces so each
 * run takes the fresh-join path.
 */
export async function seedWorkshops(): Promise<void> {
    const ids = [ACTIVE_WORKSHOP_ID, EXPIRED_WORKSHOP_ID];
    await clearWorkshopWorkspaces(ids);
    await supabase.from("workshops").delete().in("id", ids);

    const now = new Date();
    const inAWeek = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString();
    const anHourAgo = new Date(now.getTime() - 3600 * 1000).toISOString();
    const base = {
        allowed_tools: ["lens2"],
        model: MODEL,
        starter_prompt: WORKSHOP_STARTER_PROMPT,
        created_by: "e2e@seed.local",
    };
    const { error } = await supabase.from("workshops").insert([
        {
            id: ACTIVE_WORKSHOP_ID,
            name: "E2E Active Workshop",
            slug: ACTIVE_WORKSHOP_SLUG,
            expires_at: inAWeek,
            ...base,
        },
        {
            id: EXPIRED_WORKSHOP_ID,
            name: "E2E Expired Workshop",
            slug: EXPIRED_WORKSHOP_SLUG,
            expires_at: anHourAgo,
            ...base,
        },
    ]);
    if (error) throw new Error(`seedWorkshops failed: ${error.message}`);
}

const PL_WS_ID = "11111111-1111-4111-8111-111111111111";
const PL_CHART_ID = "22222222-2222-4222-8222-222222222222";
const PL_NEWEST_RUN_ID = "33333333-3333-4333-8333-333333333333";
const PL_MODEL = "meta-llama/Llama-3.1-8B";
const PL_TOKENS = [
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
const PL_N_LAYERS = 32;
const PL_LAYERS = Array.from({ length: PL_N_LAYERS }, (_, i) => i);

// Second chart: a source+target pair with a persisted intervention + patched
// result, so the E2E exercises the full activation-patching view via the
// restore path (no NDIF). Third chart: a clone of the first, used ONLY by the
// F1 history-restore test (which mutates its chart row), so the mutating test
// can reseed just its own chart under fullyParallel workers.
const PL_PATCHED_CHART_ID = "22222222-2222-4222-8222-222222222223";
const PL_PATCHED_RUN_ID = "44444444-4444-4444-8444-444444444444";
const PL_HISTORY_CHART_ID = "22222222-2222-4222-8222-222222222224";
const PL_HISTORY_RUN_PREFIX = "55555555-5555-4555-8555-55555555555";
const PL_SRC_TOKENS = ["The", " Eiffel", " Tower", " is", " in", " the", " city", " of"];
const PL_TGT_TOKENS = ["The", " Big", " Ben", " is", " in", " the", " city", " of"];
// Layer 8 stays visible at Layer Step 8 (the spec pins steps via the toolbar);
// the last token position is always rendered regardless of token step.
const PL_INTERVENTION = { srcTokenPos: 7, srcLayer: 8, tgtTokenPos: 7, tgtLayer: 8 };

/**
 * A well-formed lens payload whose final-layer top-1 at the last position is
 * `finalToken` and whose runner-up there is always `" the"`.
 *
 * Exported because that makes it the answer key for the guided tutorial's
 * run-scored checks: PatchLensArea feeds `finalPrediction(source)` and
 * `finalTopKTokens(source, 2)[1]` into the store, so a spec that fulfils
 * `/logit_lens/start` with this knows, deterministically, what "correct" is.
 */
export function buildLensData(finalToken: string, tokens: string[] = PL_TOKENS) {
    const input = tokens.slice();
    const topk = PL_LAYERS.map(() =>
        input.map((_, pos) =>
            pos === input.length - 1
                ? [finalToken, " the"]
                : [input[(pos + 1) % input.length], " a"],
        ),
    );
    const tracked = input.map((_, pos) => {
        const cand =
            pos === input.length - 1
                ? [finalToken, " the"]
                : [input[(pos + 1) % input.length], " a"];
        const map: Record<string, number[]> = {};
        for (const tok of cand) {
            map[tok] = PL_LAYERS.map(
                (li) =>
                    Math.round(
                        (tok === cand[0] ? 0.2 + (0.7 * li) / (PL_N_LAYERS - 1) : 0.1) * 1000,
                    ) / 1000,
            );
        }
        return map;
    });
    return {
        meta: { version: 2, timestamp: "seed", model: PL_MODEL },
        layers: PL_LAYERS,
        input,
        tracked,
        topk,
        entropy: null,
        positions: input.map((_, i) => i),
    };
}

// The lastRow-cells shape shared by run summaries: color ramps toward the
// final layers, final token wins in the top half.
function plLastRowCells(finalToken: string) {
    return PL_LAYERS.map((li) => ({
        token: li > PL_N_LAYERS / 2 ? finalToken : " the",
        prob: Math.round((0.15 + (0.8 * li) / (PL_N_LAYERS - 1)) * 1000) / 1000,
    }));
}

function plPromptSummary(tokens: string[], finalToken: string) {
    return {
        prompt: tokens.join(""),
        finalToken,
        lastRow: { layers: PL_LAYERS, cells: plLastRowCells(finalToken) },
    };
}

// The three prompt-history versions (successive prompt edits) shown in the
// history rail. Seeded onto the base chart and mirrored onto the F1 chart.
const PL_VERSIONS = [
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
    { id: PL_NEWEST_RUN_ID, prompt: PL_TOKENS.join(""), tok: " Paris" },
];

function plHistoryRunRow(
    v: (typeof PL_VERSIONS)[number],
    chartId: string,
    runId: string,
    createdAtMs: number,
) {
    return {
        id: runId,
        workspace_id: PL_WS_ID,
        chart_id: chartId,
        model: PL_MODEL,
        summary: {
            source: {
                prompt: v.prompt,
                finalToken: v.tok,
                lastRow: { layers: PL_LAYERS, cells: plLastRowCells(v.tok) },
            },
            params: { topk: 10, includeEntropy: true },
        },
        data: { source: buildLensData(v.tok) },
        created_at: new Date(createdAtMs).toISOString(),
    };
}

// The F1-only history chart + its mirror runs. Split out so the F1 restore
// test can reseed ONLY this chart (it mutates its row) without disturbing the
// shared charts other tests read under parallel workers.
async function seedPatchLensHistoryChart(nowMs: number): Promise<void> {
    await supabase.from("lens_runs").delete().eq("chart_id", PL_HISTORY_CHART_ID);
    await supabase.from("charts").delete().eq("id", PL_HISTORY_CHART_ID);

    const nowIso = new Date(nowMs).toISOString();
    let err = (
        await supabase.from("charts").insert({
            id: PL_HISTORY_CHART_ID,
            workspace_id: PL_WS_ID,
            name: "Eiffel Tower (history)",
            data: {
                sourcePrompt: PL_TOKENS.join(""),
                targetPrompt: "",
                lastRunSourcePrompt: PL_TOKENS.join(""),
                activeLensRunId: `${PL_HISTORY_RUN_PREFIX}3`,
            },
            type: "patch-lens",
            position: 2,
            created_at: nowIso,
            updated_at: nowIso,
        })
    ).error;
    if (err) throw new Error(`seedPatchLensHistoryChart chart failed: ${err.message}`);

    const rows = PL_VERSIONS.map((v, i) =>
        plHistoryRunRow(
            v,
            PL_HISTORY_CHART_ID,
            `${PL_HISTORY_RUN_PREFIX}${i + 1}`,
            nowMs + i * 1000,
        ),
    );
    err = (await supabase.from("lens_runs").insert(rows)).error;
    if (err) throw new Error(`seedPatchLensHistoryChart runs failed: ${err.message}`);
}

/** Reseed ONLY the F1 history chart (its row is mutated by the restore test). */
export async function reseedPatchLensHistory(): Promise<void> {
    await seedPatchLensHistoryChart(Date.now());
}

/**
 * Seed the patch-lens E2E fixture owned by `userId`, so the UI E2E exercises the
 * heatmap, the history rail, and the restored-intervention view without a model
 * run. Three charts: the base lens chart (+3 history runs), a patched
 * source→target chart with a persisted intervention, and an F1-only clone.
 * Ownership is parameterized (was hardcoded dev@localhost) so the chart route's
 * owner check passes under real auth. Delete-then-insert, idempotent on retry.
 */
export async function seedPatchLensChart(userId: string): Promise<void> {
    for (const id of [PL_CHART_ID, PL_PATCHED_CHART_ID, PL_HISTORY_CHART_ID]) {
        await supabase.from("lens_runs").delete().eq("chart_id", id);
        await supabase.from("charts").delete().eq("id", id);
    }
    await supabase.from("workspaces").delete().eq("id", PL_WS_ID);

    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    let err = (
        await supabase.from("workspaces").insert({
            id: PL_WS_ID,
            user_id: userId,
            name: "E2E Patch Lens",
            public: false,
            updated_at: nowIso,
        })
    ).error;
    if (err) throw new Error(`seedPatchLensChart workspace failed: ${err.message}`);

    // Base chart + its 3 history runs.
    err = (
        await supabase.from("charts").insert({
            id: PL_CHART_ID,
            workspace_id: PL_WS_ID,
            name: "Eiffel Tower",
            data: {
                sourcePrompt: PL_TOKENS.join(""),
                targetPrompt: "",
                lastRunSourcePrompt: PL_TOKENS.join(""),
                activeLensRunId: PL_NEWEST_RUN_ID,
            },
            type: "patch-lens",
            position: 0,
            created_at: nowIso,
            updated_at: nowIso,
        })
    ).error;
    if (err) throw new Error(`seedPatchLensChart chart failed: ${err.message}`);

    err = (
        await supabase
            .from("lens_runs")
            .insert(
                PL_VERSIONS.map((v, i) => plHistoryRunRow(v, PL_CHART_ID, v.id, now + i * 1000)),
            )
    ).error;
    if (err) throw new Error(`seedPatchLensChart lens_runs failed: ${err.message}`);

    // Patched chart: source + target + a persisted intervention whose patched
    // heatmap is stored on the run, restored by PatchLensDisplay as a controlled
    // result (renders the full cone/arrow/result view straight from the DB).
    err = (
        await supabase.from("charts").insert({
            id: PL_PATCHED_CHART_ID,
            workspace_id: PL_WS_ID,
            name: "Eiffel vs Big Ben (patched)",
            data: {
                sourcePrompt: PL_SRC_TOKENS.join(""),
                targetPrompt: PL_TGT_TOKENS.join(""),
                lastRunSourcePrompt: PL_SRC_TOKENS.join(""),
                lastRunTargetPrompt: PL_TGT_TOKENS.join(""),
                intervention: PL_INTERVENTION,
                activeLensRunId: PL_PATCHED_RUN_ID,
            },
            type: "patch-lens",
            position: 1,
            created_at: nowIso,
            updated_at: nowIso,
        })
    ).error;
    if (err) throw new Error(`seedPatchLensChart patched chart failed: ${err.message}`);

    err = (
        await supabase.from("lens_runs").insert({
            id: PL_PATCHED_RUN_ID,
            workspace_id: PL_WS_ID,
            chart_id: PL_PATCHED_CHART_ID,
            model: PL_MODEL,
            summary: {
                source: plPromptSummary(PL_SRC_TOKENS, " Paris"),
                target: plPromptSummary(PL_TGT_TOKENS, " London"),
                intervention: PL_INTERVENTION,
                // The classic outcome: the patched target now predicts the source answer.
                interventionResult: plPromptSummary(PL_TGT_TOKENS, " Paris"),
                params: { topk: 10, includeEntropy: true },
            },
            data: {
                source: buildLensData(" Paris", PL_SRC_TOKENS),
                target: buildLensData(" London", PL_TGT_TOKENS),
                interventionResult: buildLensData(" Paris", PL_TGT_TOKENS),
            },
            created_at: nowIso,
        })
    ).error;
    if (err) throw new Error(`seedPatchLensChart patched run failed: ${err.message}`);

    // F1-only history clone (base chart + mirror runs, its own chart id).
    await seedPatchLensHistoryChart(now);
}

// ---------------------------------------------------------------------------
// Guided-tutorial fixture (tests/tutorial-checks.spec.ts).
// ---------------------------------------------------------------------------

/**
 * Fixed, slot-indexed ids. Slots exist because the guided tutorial's state is
 * per (workspace, participant): a spec that needs its own uncontaminated
 * `tutorial_events` history (the notes tests) takes a slot of its own rather
 * than sharing the checks workspace, which every other test in the file writes
 * `check_answered` rows into.
 */
const tutorialSlotIds = (slot: number) => {
    const s = slot.toString(16);
    return {
        tutorialId: `e2e7a1a1-0000-4000-8000-00000000000${s}`,
        workshopId: `e2e7b2b2-0000-4000-8000-00000000000${s}`,
        workspaceId: `e2e7c3c3-0000-4000-8000-00000000000${s}`,
        chartId: `e2e7d4d4-0000-4000-8000-00000000000${s}`,
        runId: `e2e7e5e5-0000-4000-8000-00000000000${s}`,
        slug: `e2e-tutorial-checks-slot-${slot}`,
    };
};

/**
 * The model the tutorial fixture pins. A real HF id, because the prompt boxes
 * tokenize through `@huggingface/transformers` server-side — a made-up name only
 * costs a toast (tokenize failure is non-fatal), but a real one keeps the run
 * path clean. The spec stubs `/models/` with exactly this name so the workshop's
 * model pin resolves and `executeRun` has a `selectedModel`.
 */
export const TUTORIAL_MODEL = "openai-community/gpt2";

/** The seeded chart's source prompt (the first unit's prompt bank entry). */
const TUTORIAL_SOURCE_PROMPT = "The Eiffel Tower is in the city of";

/** The final-layer top-1 of the seeded run — and so the topToken answer key. */
const TUTORIAL_SEED_FINAL_TOKEN = " Paris";

const secs = (ms: number) => Math.floor(ms / 1000);

/**
 * Seed a workspace whose guided tutorial runs `content`, and a patch-lens chart
 * in it with one `lens_runs` row so the route renders a heatmap with no NDIF and
 * no Python backend.
 *
 * The chain is what `resolveTutorialForWorkspace` joins on: tutorial →
 * workshop.tutorial_id → workspace.workshop_id. Seeding our own tutorial row
 * (rather than leaning on the global `prolific-patch-lens-demo` slug fallback)
 * is deliberate — that row is shared, and another spec editing it would silently
 * change what these assertions are checking.
 *
 * Note and accept: a workspace with a `workshop_id` auto-starts the guided
 * tutorial in `workshopMode` (PatchLensArea's guided-auto-start effect). That is
 * the classroom path, and it saves the spec a click.
 *
 * Delete-then-insert with fixed ids, matching `seedPatchLensChart` — idempotent
 * across retries, and safe to call again mid-file to reset one slot.
 */
export async function seedTutorialWorkspace(
    userId: string,
    content: unknown,
    slot = 0,
): Promise<{ workspaceId: string; chartId: string; workshopSlug: string }> {
    const ids = tutorialSlotIds(slot);
    const now = Date.now();
    const expiresAt = now + 7 * 24 * 3600 * 1000;

    const chartData = {
        sourcePrompt: TUTORIAL_SOURCE_PROMPT,
        targetPrompt: "",
        lastRunSourcePrompt: TUTORIAL_SOURCE_PROMPT,
        activeLensRunId: ids.runId,
    };
    const runSummary = {
        source: plPromptSummary(PL_TOKENS, TUTORIAL_SEED_FINAL_TOKEN),
        params: { topk: 10, includeEntropy: true },
    };
    const runHeatmaps = { source: buildLensData(TUTORIAL_SEED_FINAL_TOKEN) };

    if (LOCAL_DB) {
        await seedTutorialWorkspaceSqlite({
            ids,
            userId,
            content,
            now,
            expiresAt,
            chartData,
            runSummary,
            runHeatmaps,
        });
        return { workspaceId: ids.workspaceId, chartId: ids.chartId, workshopSlug: ids.slug };
    }

    // Child → parent, so nothing is orphaned if a later delete fails.
    await supabase.from("tutorial_events").delete().eq("workspace_id", ids.workspaceId);
    await supabase.from("lens_runs").delete().eq("chart_id", ids.chartId);
    await supabase.from("charts").delete().eq("id", ids.chartId);
    // By workshop AND by id: the (user_id, workshop_id) unique index means a row
    // left by a previous run under a different user would block the insert.
    await supabase.from("workspaces").delete().eq("workshop_id", ids.workshopId);
    await supabase.from("workspaces").delete().eq("id", ids.workspaceId);
    await supabase.from("workshops").delete().eq("id", ids.workshopId);
    await supabase.from("tutorials").delete().eq("id", ids.tutorialId);

    const nowIso = new Date(now).toISOString();
    const fail = (what: string, message?: string) => {
        if (message) throw new Error(`seedTutorialWorkspace ${what} failed: ${message}`);
    };

    fail(
        "tutorial",
        (
            await supabase.from("tutorials").insert({
                id: ids.tutorialId,
                name: `E2E Tutorial Checks (slot ${slot})`,
                slug: ids.slug,
                data: content,
                created_by: "e2e@seed.local",
            })
        ).error?.message,
    );
    fail(
        "workshop",
        (
            await supabase.from("workshops").insert({
                id: ids.workshopId,
                name: `E2E Tutorial Checks (slot ${slot})`,
                slug: ids.slug,
                allowed_tools: ["patch-lens"],
                model: TUTORIAL_MODEL,
                starter_prompt: TUTORIAL_SOURCE_PROMPT,
                tutorial_id: ids.tutorialId,
                survey_url: "https://example.invalid/survey",
                expires_at: new Date(expiresAt).toISOString(),
                created_by: "e2e@seed.local",
            })
        ).error?.message,
    );
    fail(
        "workspace",
        (
            await supabase.from("workspaces").insert({
                id: ids.workspaceId,
                user_id: userId,
                name: `E2E Tutorial Checks (slot ${slot})`,
                public: false,
                workshop_id: ids.workshopId,
                updated_at: nowIso,
            })
        ).error?.message,
    );
    fail(
        "chart",
        (
            await supabase.from("charts").insert({
                id: ids.chartId,
                workspace_id: ids.workspaceId,
                name: "Tutorial checks",
                data: chartData,
                type: "patch-lens",
                position: 0,
                created_at: nowIso,
                updated_at: nowIso,
            })
        ).error?.message,
    );
    fail(
        "lens_run",
        (
            await supabase.from("lens_runs").insert({
                id: ids.runId,
                workspace_id: ids.workspaceId,
                chart_id: ids.chartId,
                model: TUTORIAL_MODEL,
                summary: runSummary,
                data: runHeatmaps,
                created_at: nowIso,
            })
        ).error?.message,
    );

    return { workspaceId: ids.workspaceId, chartId: ids.chartId, workshopSlug: ids.slug };
}

/**
 * The same seed against the local SQLite dev DB (`LOCAL_SQLITE_URL`), written
 * with raw SQL through better-sqlite3 — the driver the Next dev server itself
 * uses, so there is no second dialect to keep in step.
 *
 * Timestamp encodings mirror `schema.sqlite.ts`: drizzle's `mode: "timestamp"`
 * is unix *seconds*, and `lens_runs.created_at` is `timestamp_ms`. Getting that
 * wrong doesn't error — it silently dates a row to 1970 and the history rail
 * orders wrong.
 */
async function seedTutorialWorkspaceSqlite(args: {
    ids: ReturnType<typeof tutorialSlotIds>;
    userId: string;
    content: unknown;
    now: number;
    expiresAt: number;
    chartData: unknown;
    runSummary: unknown;
    runHeatmaps: unknown;
}) {
    const { ids, userId, content, now, expiresAt, chartData, runSummary, runHeatmaps } = args;
    const url = process.env.LOCAL_SQLITE_URL;
    if (!url)
        throw new Error(
            "seedTutorialWorkspace: NEXT_PUBLIC_LOCAL_DB is set but not LOCAL_SQLITE_URL",
        );

    // Imported here, not at the top of the file: Playwright loads this module as
    // ESM (so `require` is undefined), and every spec imports TestingUtils — a
    // static import would pull the native better-sqlite3 binding into CI runs
    // that only ever touch Postgres.
    const { default: Database } = await import("better-sqlite3");
    const db = new Database(url);
    try {
        // The dev server holds its own connection to this file; a short busy
        // timeout turns the inevitable overlap into a wait rather than SQLITE_BUSY.
        db.pragma("busy_timeout = 5000");
        db.exec("BEGIN IMMEDIATE");
        db.prepare("DELETE FROM tutorial_events WHERE workspace_id = ?").run(ids.workspaceId);
        db.prepare("DELETE FROM lens_runs WHERE chart_id = ?").run(ids.chartId);
        db.prepare("DELETE FROM charts WHERE id = ?").run(ids.chartId);
        db.prepare("DELETE FROM workspaces WHERE workshop_id = ? OR id = ?").run(
            ids.workshopId,
            ids.workspaceId,
        );
        db.prepare("DELETE FROM workshops WHERE id = ?").run(ids.workshopId);
        db.prepare("DELETE FROM tutorials WHERE id = ?").run(ids.tutorialId);

        db.prepare(
            `INSERT INTO tutorials (id, name, slug, data, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
            ids.tutorialId,
            "E2E Tutorial Checks",
            ids.slug,
            JSON.stringify(content),
            "e2e@seed.local",
            secs(now),
            secs(now),
        );
        db.prepare(
            `INSERT INTO workshops (id, name, slug, allowed_tools, model, starter_prompt,
                                    tutorial_id, survey_url, completion_text, allow_model_change,
                                    expires_at, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
            ids.workshopId,
            "E2E Tutorial Checks",
            ids.slug,
            JSON.stringify(["patch-lens"]),
            TUTORIAL_MODEL,
            TUTORIAL_SOURCE_PROMPT,
            ids.tutorialId,
            "https://example.invalid/survey",
            "",
            0,
            secs(expiresAt),
            "e2e@seed.local",
            secs(now),
            secs(now),
        );
        db.prepare(
            `INSERT INTO workspaces (id, user_id, name, public, workshop_id, prolific,
                                     created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
            ids.workspaceId,
            userId,
            "E2E Tutorial Checks",
            0,
            ids.workshopId,
            null,
            secs(now),
            secs(now),
        );
        db.prepare(
            `INSERT INTO charts (id, workspace_id, name, data, type, position, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
            ids.chartId,
            ids.workspaceId,
            "Tutorial checks",
            JSON.stringify(chartData),
            "patch-lens",
            0,
            secs(now),
            secs(now),
        );
        db.prepare(
            `INSERT INTO lens_runs (id, workspace_id, chart_id, model, summary, data, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
            ids.runId,
            ids.workspaceId,
            ids.chartId,
            TUTORIAL_MODEL,
            JSON.stringify(runSummary),
            JSON.stringify(runHeatmaps),
            now,
        );
        db.exec("COMMIT");
    } catch (err) {
        try {
            db.exec("ROLLBACK");
        } catch {
            /* nothing to roll back */
        }
        throw err;
    } finally {
        db.close();
    }
}
