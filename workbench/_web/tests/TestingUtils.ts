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

/** Service-role client — bypasses RLS; server-only key, never shipped to the browser. */
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
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

function buildLensData(finalToken: string) {
    const input = PL_TOKENS.slice();
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

/**
 * Seed a patch-lens chart + 3 prompt-history runs owned by `userId`, so the
 * patch-lens UI E2E exercises the heatmap + history rail without a model run.
 * Ownership is parameterized (was hardcoded dev@localhost) so the chart route's
 * owner check passes under real auth.
 */
export async function seedPatchLensChart(userId: string): Promise<void> {
    await supabase.from("lens_runs").delete().eq("chart_id", PL_CHART_ID);
    await supabase.from("charts").delete().eq("id", PL_CHART_ID);
    await supabase.from("workspaces").delete().eq("id", PL_WS_ID);

    const nowIso = new Date().toISOString();
    const chartData = {
        sourcePrompt: PL_TOKENS.join(""),
        targetPrompt: "",
        lastRunSourcePrompt: PL_TOKENS.join(""),
        activeLensRunId: PL_NEWEST_RUN_ID,
    };

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

    err = (
        await supabase.from("charts").insert({
            id: PL_CHART_ID,
            workspace_id: PL_WS_ID,
            name: "Eiffel Tower",
            data: chartData,
            type: "patch-lens",
            position: 0,
            created_at: nowIso,
            updated_at: nowIso,
        })
    ).error;
    if (err) throw new Error(`seedPatchLensChart chart failed: ${err.message}`);

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
        { id: PL_NEWEST_RUN_ID, prompt: PL_TOKENS.join(""), tok: " Paris" },
    ];
    const now = Date.now();
    const rows = versions.map((v, i) => {
        const cells = PL_LAYERS.map((li) => ({
            token: li > PL_N_LAYERS / 2 ? v.tok : " the",
            prob: Math.round((0.15 + (0.8 * li) / (PL_N_LAYERS - 1)) * 1000) / 1000,
        }));
        return {
            id: v.id,
            workspace_id: PL_WS_ID,
            chart_id: PL_CHART_ID,
            model: PL_MODEL,
            summary: {
                source: {
                    prompt: v.prompt,
                    finalToken: v.tok,
                    lastRow: { layers: PL_LAYERS, cells },
                },
                params: { topk: 10, includeEntropy: true },
            },
            data: { source: buildLensData(v.tok) },
            created_at: new Date(now + i * 1000).toISOString(),
        };
    });
    err = (await supabase.from("lens_runs").insert(rows)).error;
    if (err) throw new Error(`seedPatchLensChart lens_runs failed: ${err.message}`);
}
