/**
 * Playwright global setup: make sure gpt2 is actually deployed on NDIF before
 * the real-NDIF specs run. (Fixture seeding is per-file: each spec's beforeAll
 * creates a fresh user and seeds its charts via TestingUtils — see
 * seedPatchLensChart.)
 *
 * The fixtures pick gpt2 in the header model selector, but since the
 * model-selector redesign the picker hides non-runnable (cold) models — so if
 * gpt2 happens to be cold on NDIF, every real-NDIF spec dies waiting for a
 * menu item that will never appear. Warm it the same way the product's
 * on-demand deploy does (see src/lib/api/deployApi.ts): fire a tiny
 * /models/start-generate and poll the NDIF job until COMPLETED, then wait for
 * the backend catalog (rebuilt from NDIF /status roughly every minute) to
 * report the model as runnable.
 *
 * Backend unreachable → warn and continue: the seeded patch-lens specs don't
 * need a backend, and the NDIF specs will fail with their own clear errors.
 */

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const NDIF = process.env.NEXT_PUBLIC_NDIF_URL || "https://api.ndif.us";
const MODEL = "openai-community/gpt2";

const JOB_TIMEOUT_MS = 15 * 60_000; // cold deploys are slow
const CATALOG_TIMEOUT_MS = 3 * 60_000; // backend /status refresh is ~60s
// Per-request cap so a stalled backend/NDIF socket fails fast instead of
// hanging setup until the outer CI timeout (the loop deadlines above only
// advance once a fetch resolves).
const FETCH_TIMEOUT_MS = 30_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fetchWithTimeout(input: string, init: Parameters<typeof fetch>[1] = {}) {
    return fetch(input, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

async function modelStatus(): Promise<string | null> {
    try {
        const resp = await fetchWithTimeout(`${BACKEND}/models/`, {
            headers: { "X-User-Email": "e2e@workbench" },
        });
        if (!resp.ok) return null;
        const models = (await resp.json()) as { name: string; status: string }[];
        return models.find((m) => m.name === MODEL)?.status ?? null;
    } catch {
        return null;
    }
}

export default async function globalSetup() {
    const status = await modelStatus();
    if (status === null) {
        console.warn(`[global-setup] backend ${BACKEND} unreachable — skipping gpt2 warmup`);
        return;
    }
    if (status !== "cold") {
        console.log(`[global-setup] ${MODEL} status=${status} — no warmup needed`);
        return;
    }

    console.log(`[global-setup] ${MODEL} is cold on NDIF — submitting warmup generation…`);
    const resp = await fetchWithTimeout(`${BACKEND}/models/start-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Email": "e2e@workbench" },
        body: JSON.stringify({ model: MODEL, prompt: "Hello", max_new_tokens: 1 }),
    });
    if (!resp.ok) throw new Error(`[global-setup] warmup submit failed: HTTP ${resp.status}`);
    const body = (await resp.json()) as { job_id?: string | null; data?: unknown };
    if (!body.job_id) {
        // Local (non-remote) backend answers synchronously — nothing to warm.
        if (body.data != null) return;
        throw new Error("[global-setup] warmup did not start (no job id returned)");
    }

    const jobDeadline = Date.now() + JOB_TIMEOUT_MS;
    for (;;) {
        if (Date.now() > jobDeadline) throw new Error("[global-setup] gpt2 warmup timed out");
        const r = await fetchWithTimeout(`${NDIF}/response/${body.job_id}`).catch(() => null);
        if (r?.ok) {
            const job = (await r.json()) as { status?: string };
            if (job.status === "COMPLETED") break;
            if (job.status === "ERROR" || job.status === "NNSIGHT_ERROR") {
                throw new Error(`[global-setup] gpt2 warmup job failed: ${job.status}`);
            }
        }
        await sleep(3000);
    }
    console.log("[global-setup] warmup job completed — waiting for catalog to flip…");

    const catalogDeadline = Date.now() + CATALOG_TIMEOUT_MS;
    for (;;) {
        const s = await modelStatus();
        if (s && s !== "cold") {
            console.log(`[global-setup] ${MODEL} now status=${s}`);
            return;
        }
        if (Date.now() > catalogDeadline) {
            throw new Error("[global-setup] catalog never reported gpt2 as runnable");
        }
        await sleep(5000);
    }
}
