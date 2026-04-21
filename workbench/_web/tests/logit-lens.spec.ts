import { test, expect, argosScreenshot, gotoFreshLensWorkspace } from "./fixtures";

test.describe("Logit Lens", () => {
    test("enter prompt, tokenize, and view heatmap", async ({ workbenchPage: page }) => {
        await gotoFreshLensWorkspace(page);

        // Fresh workspace has an empty lens chart with a textarea
        const textarea = page.getByPlaceholder("Enter your prompt here.");
        await expect(textarea).toBeVisible({ timeout: 10_000 });

        await textarea.fill("The cat sat on the mat");
        await textarea.press("Enter");

        // After tokenization + prediction, the Heatmap/Line buttons appear
        await expect(page.getByRole("button", { name: "Heatmap" }).first()).toBeVisible({
            timeout: 15_000,
        });
        await expect(page.getByRole("button", { name: "Line" }).first()).toBeVisible();

        await argosScreenshot(page, "logit-lens-heatmap", { fullPage: false });
    });

    test("switch to line chart view", async ({ workbenchPage: page }) => {
        await gotoFreshLensWorkspace(page);

        const textarea = page.getByPlaceholder("Enter your prompt here.");
        await expect(textarea).toBeVisible({ timeout: 10_000 });
        await textarea.fill("The cat sat on the mat");
        await textarea.press("Enter");

        const lineButton = page.getByRole("button", { name: "Line" }).first();
        await expect(lineButton).toBeVisible({ timeout: 15_000 });
        await lineButton.click();

        await page.waitForTimeout(1500);

        await argosScreenshot(page, "logit-lens-line", { fullPage: false });
    });
});
