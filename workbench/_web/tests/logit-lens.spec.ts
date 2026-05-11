import {
    test,
    expect,
    argosScreenshot,
    gotoFreshLensWorkspace,
    REAL_NDIF_TIMEOUT_MS,
} from "./fixtures";

const PROMPT = "The Eiffel Tower is in the city of";

test.describe("Logit Lens (real NDIF)", () => {
    // Real NDIF jobs can take a while to start, run, and round-trip results.
    test.setTimeout(REAL_NDIF_TIMEOUT_MS * 4);

    test("enter prompt, tokenize, get a real prediction, see heatmap controls", async ({
        workbenchPage: page,
    }) => {
        await gotoFreshLensWorkspace(page);

        const textarea = page.getByPlaceholder("Enter your prompt here.");
        await expect(textarea).toBeVisible({ timeout: 15_000 });

        await textarea.fill(PROMPT);
        await textarea.press("Enter");

        // Once the real /models/start-prediction call returns, the
        // chart-type toggle (Heatmap / Line) appears.
        await expect(page.getByRole("button", { name: "Heatmap" }).first()).toBeVisible({
            timeout: REAL_NDIF_TIMEOUT_MS,
        });
        await expect(page.getByRole("button", { name: "Line" }).first()).toBeVisible();

        await argosScreenshot(page, "logit-lens-heatmap", { fullPage: false });
    });

    test("switch to line chart view and screenshot", async ({ workbenchPage: page }) => {
        await gotoFreshLensWorkspace(page);

        const textarea = page.getByPlaceholder("Enter your prompt here.");
        await expect(textarea).toBeVisible({ timeout: 15_000 });
        await textarea.fill(PROMPT);
        await textarea.press("Enter");

        const lineButton = page.getByRole("button", { name: "Line" }).first();
        await expect(lineButton).toBeVisible({ timeout: REAL_NDIF_TIMEOUT_MS });
        await lineButton.click();

        // Wait for the line chart to render — line chart fetches another
        // job from NDIF (per-token probabilities for selected target).
        await page.waitForTimeout(2000);
        await expect(lineButton).toBeVisible();

        await argosScreenshot(page, "logit-lens-line", { fullPage: false });
    });

    test("change statistic from probability to entropy", async ({ workbenchPage: page }) => {
        await gotoFreshLensWorkspace(page);

        const textarea = page.getByPlaceholder("Enter your prompt here.");
        await textarea.fill(PROMPT);
        await textarea.press("Enter");

        // Wait for first prediction round-trip to finish
        await expect(page.getByRole("button", { name: "Heatmap" }).first()).toBeVisible({
            timeout: REAL_NDIF_TIMEOUT_MS,
        });

        // Open the statistic dropdown — its trigger button shows "Probability"
        // by default for a freshly created lens chart.
        const statTrigger = page.getByRole("button", { name: /Probability/i }).first();
        await expect(statTrigger).toBeVisible();
        await statTrigger.click();

        const entropyItem = page.getByRole("menuitem", { name: /Entropy/i });
        await expect(entropyItem).toBeVisible({ timeout: 5_000 });
        await entropyItem.click();

        // The dropdown trigger should now read "Entropy"
        await expect(page.getByRole("button", { name: /Entropy/i }).first()).toBeVisible({
            timeout: 10_000,
        });
    });
});
