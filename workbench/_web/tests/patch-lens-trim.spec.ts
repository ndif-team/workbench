import { test, expect, Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { waitForModelsLoaded, REAL_NDIF_TIMEOUT_MS } from "./fixtures";

/**
 * Regression E2E for the patch-lens prompt-trim behavior.
 *
 * A trailing space in the source prompt tokenizes as its own token and
 * collapses the prediction, so Patch Lens trims the prompt before running.
 * The bug: it sent the trimmed prompt to the model (heatmap computed on the
 * trimmed text) but left the trailing space in the source box — so the box no
 * longer matched the heatmap and the predicted-next-token hint was suppressed.
 *
 * Correct behavior (asserted here): running rewrites the source box to the
 * trimmed prompt, so the textbox matches what was actually run.
 *
 * Uses the seeded chart (tests/seed-patch-lens.cjs) as a landing point, then
 * does a real gpt2 run against NDIF (same pattern as logit-lens.spec.ts).
 */

const WS = "11111111-1111-4111-8111-111111111111";
const CHART = "22222222-2222-4222-8222-222222222222";
const URL = `/workbench/${WS}/patch-lens/${CHART}`;

const SOURCE = "#patch-lens-source-prompt";
const PROMPT_WITH_SPACE = "The Eiffel Tower is in the city of ";
const PROMPT_TRIMMED = "The Eiffel Tower is in the city of";

// The seeded source composer opens in the tokenized chip view; click it to
// reveal the textarea, then return the textarea locator.
async function openSourceEditor(page: Page) {
    const section = page.locator(SOURCE);
    const textarea = section.getByPlaceholder(/Enter source prompt/i);
    if ((await textarea.count()) === 0) {
        await section.click();
    }
    return textarea;
}

test.describe("patch-lens prompt trimming (real NDIF)", () => {
    // Real NDIF jobs can take a while to start, run, and round-trip.
    test.setTimeout(REAL_NDIF_TIMEOUT_MS * 4);

    test.beforeAll(() => {
        execFileSync("node", ["tests/seed-patch-lens.cjs"], { stdio: "inherit" });
    });

    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        // Keep the auto-starting tutorial closed so it doesn't overlay the controls.
        await page.addInitScript(() =>
            localStorage.setItem("workbench:patch-lens-tutorial-completed:v1", "true"),
        );
        await page.goto(URL);
    });

    test("running a trailing-space prompt rewrites the source box to the trimmed text", async ({
        page,
    }) => {
        await waitForModelsLoaded(page); // pick gpt2 — small + always deployed

        // Enter a source prompt WITH a trailing space.
        const textarea = await openSourceEditor(page);
        await expect(textarea).toBeVisible({ timeout: 15_000 });
        await textarea.fill(PROMPT_WITH_SPACE);
        await expect(textarea).toHaveValue(PROMPT_WITH_SPACE);

        // Run against NDIF.
        await page.getByRole("button", { name: /Run Patch Lens/i }).click();
        // Wait for the run to finish (the button reverts from "Computing...").
        await expect(page.getByText(/Computing/i)).toHaveCount(0, {
            timeout: REAL_NDIF_TIMEOUT_MS,
        });

        // The fix: the source box now holds the trimmed prompt (no trailing
        // space), matching the prompt the heatmap was computed from.
        const reopened = await openSourceEditor(page);
        await expect(reopened).toHaveValue(PROMPT_TRIMMED);
    });
});
