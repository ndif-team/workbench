import { test as base, expect, Page } from "@playwright/test";
import { argosScreenshot } from "@argos-ci/playwright";

/**
 * Fixtures for E2E tests that hit the real workbench API and the real NDIF
 * service. No mocks — we want the workflow exercised end to end against a
 * live model deployment.
 */

const REAL_NDIF_TIMEOUT_MS = 90_000;

const DEBUG_NETWORK = !!process.env.DEBUG_TESTS;

export const test = base.extend<{ workbenchPage: Page }>({
    workbenchPage: async ({ page }, use) => {
        page.on("pageerror", (err) => {
            console.error("[browser pageerror]", err.message);
        });
        page.on("console", (msg) => {
            if (msg.type() === "error" || msg.type() === "warning") {
                console.error(`[browser ${msg.type()}]`, msg.text());
            }
        });
        if (DEBUG_NETWORK) {
            page.on("request", (req) => {
                const url = req.url();
                if (url.includes("ndif.us") || url.includes("localhost:8000")) {
                    console.log(`→ ${req.method()} ${url}`);
                }
            });
            page.on("response", async (resp) => {
                const url = resp.url();
                if (url.includes("ndif.us") || url.includes("localhost:8000")) {
                    console.log(`← ${resp.status()} ${url}`);
                }
            });
            page.on("requestfailed", (req) => {
                console.error(`✗ ${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
            });
        }
        await use(page);
    },
});

/**
 * Wait until the model dropdown has been populated by the backend. The
 * `/models/` endpoint reaches out to NDIF on first call and can be slow,
 * so we give it a generous timeout.
 */
export async function waitForModelsLoaded(page: Page) {
    await expect
        .poll(
            async () =>
                await page.locator('[role="combobox"]').filter({ hasText: /gpt2/i }).count(),
            { timeout: REAL_NDIF_TIMEOUT_MS, intervals: [1000] },
        )
        .toBeGreaterThan(0);
}

/** Navigate to a fresh workspace with a lens chart. */
export async function gotoFreshLensWorkspace(page: Page) {
    await page.goto("/workbench?createNew=true");
    await page.waitForURL(/\/workbench\/[^/]+\/[^/]+/, { timeout: 30_000 });
    await waitForModelsLoaded(page);
}

/** Navigate to a fresh workspace with an activation patching chart. */
export async function gotoFreshAPWorkspace(
    page: Page,
    opts?: {
        srcPrompt?: string;
        tgtPrompt?: string;
        srcPos?: number[];
        tgtPos?: number[];
    },
) {
    const params = new URLSearchParams({
        createNew: "true",
        tool: "Activation Patching",
        srcPrompt: opts?.srcPrompt ?? "",
        tgtPrompt: opts?.tgtPrompt ?? "",
        srcPos: JSON.stringify(opts?.srcPos ?? []),
        tgtPos: JSON.stringify(opts?.tgtPos ?? []),
        tgtFreeze: JSON.stringify([]),
        model: "openai-community/gpt2",
    });
    await page.goto(`/workbench?${params.toString()}`);
    await page.waitForURL(/\/activation-patching\//, { timeout: 30_000 });
    await waitForModelsLoaded(page);
}

export { expect, argosScreenshot, REAL_NDIF_TIMEOUT_MS };
