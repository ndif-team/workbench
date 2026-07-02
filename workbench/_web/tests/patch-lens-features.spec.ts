import { test, expect, Page } from "@playwright/test";
import { argosScreenshot } from "@argos-ci/playwright";
import { execFileSync } from "node:child_process";

/**
 * UI E2E for the patch-lens workshop features. These run against seeded chart +
 * history data (see tests/seed-patch-lens.cjs) so they exercise the real
 * edulogitlens widget and the F1 history rail WITHOUT a model run / NDIF —
 * the behaviors under test are all front-end.
 *
 *   B1: the final-token row is rendered and in-viewport (not clipped).
 *   F1: the history rail stacks one strip per past run, newest highlighted,
 *       and clicking a strip loads its prompt back into the source composer.
 *
 * Pilot-feedback UI spec (2026-07):
 *   - spaces inside tokens render as ␣ everywhere
 *   - axis titles carry the downsampling step: "Layer (Step: X)" / "Tokens (Step: X)"
 *   - collapsed rows/columns show amber, labeled, clickable break-bands
 *   - the top-token panel marks final predictions with labeled borders
 *   - the brown final-token cell tint is gone
 *   - a restored intervention renders the result grid and auto-scrolls to it
 *   - tutorial: chapter 1 ("Reading the lens") auto-runs and opens with
 *     "Welcome to Patch Lens."; chapter 2 is reachable from the Tutorial menu
 *
 * Visual regression (Argos): the lens heatmap view, the intervention (patching)
 * view, and the prompt history (rail + compare overlay).
 */

const WS = "11111111-1111-4111-8111-111111111111";
const CHART = "22222222-2222-4222-8222-222222222222";
const PATCHED_CHART = "22222222-2222-4222-8222-222222222223";
// F1 restores a history strip, which PERSISTS onto the chart row — the
// mutating test gets its own seeded clone so the other specs stay
// deterministic under parallel workers.
const HISTORY_CHART = "22222222-2222-4222-8222-222222222224";
const URL = `/workbench/${WS}/patch-lens/${CHART}`;
const PATCHED_URL = `/workbench/${WS}/patch-lens/${PATCHED_CHART}`;
const HISTORY_URL = `/workbench/${WS}/patch-lens/${HISTORY_CHART}`;

// Keep in sync with stores/usePatchLensTutorial.ts.
const TUTORIAL_KEY = "workbench:patch-lens-tutorial-completed:v2";

// Token-column row labels are the only [title] elements in the display.
const tokenLabels = (page: Page) =>
    page.locator("#patch-lens-display .text-gray-700.truncate[title]");
const historyStrips = (page: Page) => page.locator('[data-testid="lens-history-strip"]');

const seed = () => {
    // CI runs the default Playwright config with no seed step and no
    // globalSetup, so seed the fixed charts + history here. seed-patch-lens.cjs
    // loads .env and writes to the same SQLite DB the server reads (e2e.db in
    // CI, local.db locally); its DELETE-then-INSERT is idempotent across
    // retries. Runs after the webServer is up, so the server sees the committed
    // rows on the next query.
    execFileSync("node", ["tests/seed-patch-lens.cjs"], { stdio: "inherit" });
};

/** Pin the shared toolbar steps so the grid density (and Argos screenshots)
 *  don't depend on the autofit's viewport-derived downsampling. The toolbar
 *  renders exactly two number inputs: Token Step then Layer Step. */
async function pinSteps(page: Page, tokenStep: number, layerStep: number) {
    const inputs = page.locator('#patch-lens-display input[type="number"]');
    await inputs.nth(0).fill(String(tokenStep));
    await inputs.nth(1).fill(String(layerStep));
}

test.describe("patch-lens workshop features (seeded, no NDIF)", () => {
    test.beforeAll(seed);

    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 720 });
        // The Patch Lens tutorial auto-starts on first visit (reactour) and
        // overlays the page, blocking the heatmap + rail. Mark it completed so
        // it stays closed — the tutorial has its own describe block below.
        await page.addInitScript(([key]) => localStorage.setItem(key, "true"), [TUTORIAL_KEY]);
        await page.goto(URL);
        // Heatmap rendered once token labels appear.
        await expect(tokenLabels(page).first()).toBeVisible({ timeout: 30_000 });
    });

    test("B1: final-token row is rendered and in viewport (not clipped)", async ({ page }) => {
        const labels = tokenLabels(page);
        // Multiple rows render for the 12-token prompt.
        expect(await labels.count()).toBeGreaterThan(1);
        const last = labels.last();
        await expect(last).toHaveAttribute("title", ":"); // final fixture token
        // The B1 bug omitted this row entirely (clipped by an auto-fit cap). It
        // must now render and be reachable in the scrollable heatmap, so scroll
        // it into view and confirm it's actually on screen (not cut off).
        await last.scrollIntoViewIfNeeded();
        await expect(last).toBeInViewport();
    });

    test("F1: history rail stacks runs; newest highlighted; click loads prompt", async ({
        page,
    }) => {
        // Restoring persists onto the chart row — run against the F1-only
        // clone so the shared chart stays pristine for the other specs.
        await page.goto(HISTORY_URL);
        await expect(tokenLabels(page).first()).toBeVisible({ timeout: 30_000 });

        // The prompt history now renders inline under the Run button (no
        // collapse/expand step) — the strips are present immediately.
        const strips = historyStrips(page);
        await expect(strips).toHaveCount(3);

        // Newest first and highlighted; older ones dimmed (inactive).
        await expect(strips.first()).toHaveAttribute("data-active", "true");
        await expect(strips.nth(1)).toHaveAttribute("data-active", "false");

        // Strips show their final-token prediction.
        await expect(strips.filter({ hasText: "Rome," })).toHaveCount(1);

        // Clicking the "Rome," version restores it into the source composer.
        // A restore shows the tokenized CHIP view (not the raw textarea) — and on
        // the gpt2-only CI backend the run's model isn't re-selectable — so assert
        // against the source SECTION's text rather than a textarea value: it must
        // show the Rome prompt and NOT the "Rome not Paris" run (the only other
        // strip containing "Rome").
        await strips.filter({ hasText: "Rome," }).click();
        const sourceArea = page.locator("#patch-lens-source-prompt");
        await expect(sourceArea).toContainText("Rome");
        await expect(sourceArea).not.toContainText("Paris");
    });

    test("tokens render their spaces as ␣ (row labels and cells)", async ({ page }) => {
        // Show every row: autofit hides odd token indices at this viewport,
        // and " Eiffel" is row index 1.
        await pinSteps(page, 1, 8);

        // Row label for the " Eiffel" token: raw token stays in title, display
        // shows the open-box marker.
        const eiffel = tokenLabels(page).filter({ hasText: "Eiffel" }).first();
        await expect(eiffel).toHaveAttribute("title", " Eiffel");
        await expect(eiffel).toHaveText("␣Eiffel");

        // Heatmap cell text (cell spans carry the raw token in title): row 0's
        // top-1 prediction is " Eiffel", displayed as ␣Eiffel.
        const eiffelCell = page
            .locator('#patch-lens-display span.tracking-tight[title=" Eiffel"]')
            .first();
        await eiffelCell.scrollIntoViewIfNeeded();
        await expect(eiffelCell).toHaveText("␣Eiffel");
    });

    test("axis titles show the token/layer step", async ({ page }) => {
        const display = page.locator("#patch-lens-display");
        // "Layer (Step: X)" renders above AND below the grid.
        await expect(display.getByText(/^Layer \(Step: \d+\)$/)).toHaveCount(2);
        // Rotated y-axis title outside the scroll container.
        await expect(display.getByText(/^Tokens \(Step: \d+\)$/)).toHaveCount(1);
    });

    test("collapsed rows/columns show amber labeled expanders that expand on click", async ({
        page,
    }) => {
        // The 12-token × 32-layer fixture at 1280×720 always downsamples, so
        // both gap expanders exist. The row expander carries a legible count
        // label ("⋯ N hidden"), not the old faint 9px text.
        const rowExpander = page.getByTestId("token-gap-expander").first();
        await expect(rowExpander).toBeVisible();
        await expect(rowExpander).toHaveText(/⋯ \d+ hidden/);

        const colExpander = page.getByTestId("layer-gap-expander").first();
        await expect(colExpander).toBeVisible();

        // Clicking an expander reveals the hidden rows/columns.
        const rowsBefore = await tokenLabels(page).count();
        await rowExpander.click();
        expect(await tokenLabels(page).count()).toBeGreaterThan(rowsBefore);

        const colsBefore = await page.getByTestId("layer-gap-expander").count();
        await colExpander.click();
        // Expanding a column gap removes that expander (its layers are shown).
        expect(await page.getByTestId("layer-gap-expander").count()).toBeLessThan(colsBefore);
    });

    test("top-token panel marks final predictions with labeled borders; no brown legend", async ({
        page,
    }) => {
        // The brown final-token tint (and its legend key) is gone.
        await expect(page.getByText("Final output token")).toHaveCount(0);

        // Click the final-layer cell of the last row (the bottom-right cell —
        // its top-1 is the run's final prediction, which is both this row's
        // final prediction AND the model's output).
        const lastCell = page.locator("#patch-lens-display span.tracking-tight[title]").last();
        await lastCell.scrollIntoViewIfNeeded();
        await lastCell.click();

        // The draggable top-tokens panel opens with both labeled markers.
        await expect(page.getByText("Selected Position")).toBeVisible();
        await expect(page.getByText("Final prediction (this position)")).toBeVisible();
        await expect(page.getByText("Model's final output")).toBeVisible();
    });

    test("visual: lens heatmap view", async ({ page }) => {
        // Pin the density so the screenshot doesn't ride on autofit.
        await pinSteps(page, 2, 8);
        await expect(page.getByTestId("token-gap-expander").first()).toBeVisible();
        await argosScreenshot(page, "patch-lens-lens-view", { fullPage: false });
    });

    test("visual: prompt history rail and compare overlay", async ({ page }) => {
        const rail = page.getByTestId("lens-history-list");
        await expect(historyStrips(page)).toHaveCount(3);
        await argosScreenshot(page, "patch-lens-history-rail", {
            element: rail,
        });

        // Compare overlay: full-screen last-row comparison of the three runs.
        await page.getByRole("button", { name: /compare/i }).click();
        await expect(page.getByText("Compare prompts")).toBeVisible();
        await argosScreenshot(page, "patch-lens-history-compare", { fullPage: false });
    });
});

test.describe("patch-lens intervention (seeded restore, no NDIF)", () => {
    test.beforeAll(seed);

    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.addInitScript(([key]) => localStorage.setItem(key, "true"), [TUTORIAL_KEY]);
        await page.goto(PATCHED_URL);
        await expect(tokenLabels(page).first()).toBeVisible({ timeout: 30_000 });
    });

    test("restored intervention renders the result grid and auto-scrolls it into view", async ({
        page,
    }) => {
        // Source and target grids render side by side (grid card headings).
        await expect(page.getByRole("heading", { name: "Source Prompt" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Target Prompt" })).toBeVisible();

        // The persisted patch restores as a controlled result: the third grid
        // appears without any drag, and the explorer scrolls it into view.
        const resultHeader = page.getByRole("heading", { name: "Result (Intervened)" });
        await expect(resultHeader).toBeVisible();
        await expect(resultHeader).toBeInViewport({ timeout: 10_000 });
        await expect(page.getByRole("button", { name: /reset intervention/i })).toBeVisible();

        // The result sidebar auto-selects the last cell — its top token is the
        // patched-in answer, marked as the model's final output.
        await expect(page.getByText("Model's final output").first()).toBeVisible();
    });

    test("visual: intervention (patching) view", async ({ page }) => {
        const resultHeader = page.getByRole("heading", { name: "Result (Intervened)" });
        await expect(resultHeader).toBeVisible();
        // Pin the density (re-laying out the grids), then bring the result
        // into frame ourselves — the auto-scroll behavior has its own test.
        await pinSteps(page, 1, 8);
        await resultHeader.scrollIntoViewIfNeeded();
        // Let the reveal/cascade animations settle so the screenshot is stable.
        await page.waitForTimeout(1500);
        await argosScreenshot(page, "patch-lens-intervention", { fullPage: false });
    });
});

test.describe("patch-lens tutorial", () => {
    test.beforeAll(seed);

    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 720 });
        // No completed flag → the tour auto-starts (fresh browser context).
        await page.goto(URL);
    });

    test("chapter 1 auto-runs with Patch Lens welcome; chapter 2 opens from the Tutorial menu", async ({
        page,
    }) => {
        // Auto-start fires ~600ms after mount.
        await expect(page.getByText(/Welcome to Patch Lens\./)).toBeVisible({
            timeout: 15_000,
        });
        await page.getByRole("button", { name: "Close tour" }).click();

        // The Tutorial button is now a menu listing both chapters.
        await page.getByRole("button", { name: "Tutorial" }).click();
        const lensChapter = page.getByRole("menuitem", { name: "Reading the lens" });
        const patchChapter = page.getByRole("menuitem", { name: "Activation patching" });
        await expect(lensChapter).toBeVisible();
        await expect(patchChapter).toBeVisible();

        // Launching chapter 2 shows the activation-patching intro step.
        await patchChapter.click();
        await expect(
            page.getByText(/Activation patching takes a piece of internal state/),
        ).toBeVisible();
        await page.getByRole("button", { name: "Close tour" }).click();
    });
});
