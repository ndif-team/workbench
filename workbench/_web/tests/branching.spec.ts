import { test, expect, argosScreenshot, REAL_NDIF_TIMEOUT_MS } from "./fixtures";

/**
 * Branching Generations E2E. Workshop demo path uses pre-cached payload —
 * fast and deterministic, no live NDIF traffic for participant clicks.
 */

const BRANCHING_ID = "branching_demo_fixture";

test.describe("Branching Generations (workshop demo)", () => {
    test.setTimeout(REAL_NDIF_TIMEOUT_MS);

    test("renders side-by-side trajectories", async ({ workbenchPage: page }) => {
        await page.goto(`/workshop/${BRANCHING_ID}`);
        await expect(page.getByTestId("trajectory-comparison")).toBeVisible({ timeout: 15_000 });

        await expect(page.getByTestId("trajectory-panel-0")).toBeVisible();
        await expect(page.getByTestId("trajectory-panel-1")).toBeVisible();
        await expect(page.getByTestId("trajectory-panel-2")).toBeVisible();

        await argosScreenshot(page, "branching-side-by-side", { fullPage: false });
    });

    test("clicking a token opens drill-down with top-K alternatives", async ({
        workbenchPage: page,
    }) => {
        await page.goto(`/workshop/${BRANCHING_ID}`);
        await expect(page.getByTestId("trajectory-panel-0")).toBeVisible({ timeout: 15_000 });

        // First token of first sample.
        await page.getByTestId("trajectory-token-0-0").click();
        await expect(page.getByTestId("branch-drill-down")).toBeVisible();
        await expect(page.getByTestId("drill-down-alt-0")).toBeVisible();
        await expect(page.getByTestId("drill-down-alt-0-prob")).toBeVisible();

        await page.getByTestId("branch-drill-down-close").click();
        await expect(page.getByTestId("branch-drill-down")).toHaveCount(0);
    });

    test("divergent token at sample 2 position 0 is marked", async ({ workbenchPage: page }) => {
        await page.goto(`/workshop/${BRANCHING_ID}`);
        // Sample 2 has " a" at pos 0 while samples 0 and 1 have " Paris" — divergent.
        const token = page.getByTestId("trajectory-token-2-0");
        await expect(token).toBeVisible({ timeout: 15_000 });
        await expect(token).toHaveAttribute("data-divergent", "true");
    });

    test("pre-cached drill-down preview renders without live NDIF call", async ({
        workbenchPage: page,
    }) => {
        const ndifCalls: string[] = [];
        page.on("request", (req) => {
            const url = req.url();
            if (url.includes("ndif.us")) ndifCalls.push(url);
        });

        await page.goto(`/workshop/${BRANCHING_ID}`);
        await page.getByTestId("trajectory-token-2-0").click();
        // The fixture has a pre-cached drill-down for sample_idx=2, branch_position=0,
        // forced_token_id=6342 ("Paris"). Look for its continuation preview.
        await expect(page.getByTestId("branch-drill-down")).toBeVisible({ timeout: 5_000 });

        // No NDIF call should happen for the workshop drill-down.
        expect(ndifCalls).toHaveLength(0);
    });

    test("Generate full alternate trajectory renders a new panel", async ({
        workbenchPage: page,
    }) => {
        // Hits POST /branching/continue live via the workshop server action.
        // gpt2 is fast enough (~5s) that we don't need the long-running NDIF
        // budget here.
        test.setTimeout(REAL_NDIF_TIMEOUT_MS * 2);

        await page.goto(`/workshop/${BRANCHING_ID}`);
        await expect(page.getByTestId("trajectory-panel-0")).toBeVisible({ timeout: 15_000 });

        // Open the drill-down on a position with realistic alternatives.
        await page.getByTestId("trajectory-token-0-0").click();
        await expect(page.getByTestId("branch-drill-down")).toBeVisible();

        // The first NON-chosen alternative should have a "Generate" button.
        const generate = page
            .getByTestId(/^drill-down-alt-\d+-generate$/)
            .first();
        await expect(generate).toBeVisible();
        await generate.click();

        // A 4th panel slides in once the call completes.
        await expect(page.getByTestId("trajectory-alternate-panel-0")).toBeVisible({
            timeout: REAL_NDIF_TIMEOUT_MS,
        });
    });
});
