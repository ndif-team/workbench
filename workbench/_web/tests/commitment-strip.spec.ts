import { test, expect, argosScreenshot, REAL_NDIF_TIMEOUT_MS } from "./fixtures";

/**
 * Commitment-Strip Logit Lens E2E. Workshop path uses pre-cached payload.
 */

const COMMITMENT_ID = "commitment_strip_fixture";

test.describe("Commitment-Strip Logit Lens (workshop)", () => {
    test.setTimeout(REAL_NDIF_TIMEOUT_MS);

    test("renders heat-strip from pre-cached payload", async ({ workbenchPage: page }) => {
        await page.goto(`/workshop/${COMMITMENT_ID}`);
        await expect(page.getByTestId("commitment-strip")).toBeVisible({ timeout: 15_000 });
        // Fixture has 5 completion tokens.
        await expect(page.getByTestId("heat-strip-token-0")).toBeVisible();
        await expect(page.getByTestId("heat-strip-token-4")).toBeVisible();

        await argosScreenshot(page, "commitment-strip-default", { fullPage: false });
    });

    test("each token has a commitment-layer attribute (or null)", async ({
        workbenchPage: page,
    }) => {
        await page.goto(`/workshop/${COMMITMENT_ID}`);
        const t0 = page.getByTestId("heat-strip-token-0");
        await expect(t0).toBeVisible({ timeout: 15_000 });
        const layerAttr = await t0.getAttribute("data-commitment-layer");
        expect(layerAttr).not.toBeNull();
    });

    test("toggling definition recolors without a refetch", async ({ workbenchPage: page }) => {
        await page.goto(`/workshop/${COMMITMENT_ID}`);
        await expect(page.getByTestId("commitment-strip")).toBeVisible({ timeout: 15_000 });

        // Capture network calls AFTER the initial load.
        const apiCalls: string[] = [];
        page.on("request", (req) => {
            const url = req.url();
            if (url.includes("/examples/") || url.includes("/commitment_strip/")) {
                apiCalls.push(url);
            }
        });

        await page.getByTestId("commitment-strip-def-top3").click();
        await expect(page.getByTestId("commitment-strip")).toHaveAttribute(
            "data-definition",
            "top3",
        );

        await page.getByTestId("commitment-strip-def-p_gt_0_5").click();
        await expect(page.getByTestId("commitment-strip")).toHaveAttribute(
            "data-definition",
            "p_gt_0_5",
        );

        // No new fetches for the underlying data.
        expect(apiCalls).toHaveLength(0);
    });
});
