import { test, expect } from "@playwright/test";
import { createTestUser, loginAsUser, type TestingUser } from "./TestingUtils";

// Fresh user per file (real auth); log in before each test so "/" resolves a
// session instead of bouncing to /login.
let user: TestingUser;
test.beforeAll(async () => {
    user = await createTestUser();
});
test.beforeEach(async ({ page }) => {
    await loginAsUser(page, user);
});

test("app loads and redirects to workbench", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/workbench/i);
});
