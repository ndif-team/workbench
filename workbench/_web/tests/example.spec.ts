import { test, expect } from "@playwright/test";

test("app loads and redirects to workbench", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/workbench/i);
});
