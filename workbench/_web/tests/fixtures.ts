import { test as base, expect, Page } from "@playwright/test";
import { argosScreenshot } from "@argos-ci/playwright";

/**
 * Fixtures for E2E tests that hit the real workbench API and the real NDIF
 * service. No mocks — we want the workflow exercised end to end against a
 * live model deployment.
 */

const REAL_NDIF_TIMEOUT_MS = 90_000;

// The model the E2E suite runs against. Must be one NDIF currently serves "hot";
// gpt2 dropped out of the hot set, so the suite uses gpt-j-6b. E2E_MODEL is the
// full HF id (URL params, workshop config, model-select option); E2E_MODEL_LABEL
// is the short name shown in the picker/pill.
export const E2E_MODEL = "EleutherAI/gpt-j-6b";
export const E2E_MODEL_LABEL = "gpt-j-6b";
const E2E_MODEL_RE = new RegExp(E2E_MODEL_LABEL, "i");

const DEBUG_NETWORK = !!process.env.DEBUG_TESTS;

export const test = base.extend<{ workbenchPage: Page }>({
    // Playwright fixtures receive a "use" callback by convention, but that
    // name triggers react-hooks/rules-of-hooks (the lint rule treats any
    // identifier starting with "use" as a Hook). Rename to runFixture.
    workbenchPage: async ({ page }, runFixture) => {
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
        await runFixture(page);
    },
});

/**
 * Wait for the model selector to populate, then make sure the workspace is on
 * the E2E model — selecting it from the picker if it isn't already.
 *
 * The workspace-header ModelControl shows a "Fetching models…" pill while
 * loading and only swaps in the real trigger button once `/models/` resolves
 * (a slow first call to NDIF), so awaiting the trigger gates on models arriving.
 *
 * Against real NDIF the catalog is the full live roster — the e2e config's
 * model list doesn't restrict it in remote mode (the catalog is rebuilt from
 * NDIF's /status), and the header defaults to whichever model sorts first, not
 * necessarily our model. So we pick E2E_MODEL explicitly (a currently-hot
 * deployment), which keeps the run and downstream assertions deterministic.
 * `handleSelect` sets the workspace's selected model, so this also drives what
 * the chart runs.
 */
export async function waitForModelsLoaded(page: Page) {
    const trigger = page.getByTestId("model-select-trigger");
    await expect(trigger).toBeVisible({ timeout: REAL_NDIF_TIMEOUT_MS });

    // Already on the E2E model — nothing to do (e.g. a workspace opened with it).
    if ((await trigger.filter({ hasText: E2E_MODEL_RE }).count()) > 0) return;

    // Open the picker, filter to the E2E model via its search box, and select it.
    await trigger.click();
    await page.getByPlaceholder(/search models/i).fill(E2E_MODEL_LABEL);
    await page.getByRole("menuitem", { name: E2E_MODEL_RE }).first().click();
    await expect(trigger).toContainText(E2E_MODEL_RE);
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
        model: E2E_MODEL,
    });
    await page.goto(`/workbench?${params.toString()}`);
    await page.waitForURL(/\/activation-patching\//, { timeout: 30_000 });
    await waitForModelsLoaded(page);
}

export { expect, argosScreenshot, REAL_NDIF_TIMEOUT_MS };
