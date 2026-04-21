import { test, expect, argosScreenshot, gotoFreshLensWorkspace, gotoFreshAPWorkspace } from "./fixtures";

test.describe("Activation Patching", () => {
  test("create chart via sidebar and see controls", async ({ workbenchPage: page }) => {
    // Start with a lens workspace, then use sidebar to create AP chart
    await gotoFreshLensWorkspace(page);

    // Click the "Activation Patching" button in the sidebar
    const apButton = page.getByRole("button", { name: "Activation Patching" }).first();
    await expect(apButton).toBeVisible({ timeout: 10_000 });
    await apButton.click();

    // Wait for navigation to the activation patching page
    await page.waitForURL(/\/activation-patching\//, { timeout: 15_000 });

    await expect(page.getByText("Source Prompt", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Target Prompt", { exact: true })).toBeVisible();

    // Fill in source prompt
    const srcTextarea = page.getByPlaceholder("Enter source prompt...");
    await srcTextarea.fill("The cat sat on the mat");
    await srcTextarea.blur();
    await page.waitForTimeout(500);

    // After blur, source tokenizes. Fill target prompt.
    const tgtTextarea = page.getByPlaceholder("Enter target prompt...");
    await tgtTextarea.fill("The dog sat on the mat");
    await tgtTextarea.blur();
    await page.waitForTimeout(500);

    await argosScreenshot(page, "activation-patching-controls", { fullPage: false });
  });

  test("run with pre-filled params", async ({ workbenchPage: page }) => {
    await gotoFreshAPWorkspace(page, {
      srcPrompt: "The cat sat on the mat",
      tgtPrompt: "The dog sat on the mat",
      srcPos: [1],
      tgtPos: [1],
    });

    await expect(page.getByRole("heading", { name: "Activation Patching" })).toBeVisible({ timeout: 10_000 });

    // Wait for auto-run to complete
    await page.waitForTimeout(3000);

    await argosScreenshot(page, "activation-patching-results", { fullPage: false });
  });
});
