import { test, expect } from "@playwright/test";
import { createTestUser, loginAsUser, seedWorkshops, type TestingUser } from "./TestingUtils";

/**
 * UI E2E for the /admin/workshops/[id] analytics dashboard. Two paths:
 *  - a non-admin session gets a 404 (the layout gate 404s before rendering, so
 *    any id works — the route's existence isn't advertised), and
 *  - an allowlisted admin reaches the dashboard from the list's "View analytics"
 *    row action and sees the stat tiles.
 *
 * Runs under real auth like workshop-admin.spec.ts. E2E_ADMIN_EMAIL is in CI's
 * ADMIN_EMAILS, so the admin user's session allowlists.
 */

const ACTIVE_WORKSHOP_NAME = "E2E Active Workshop";
// Any well-formed id — the non-admin gate 404s before the id is ever read.
const ANY_WORKSHOP_ID = "44444444-4444-4444-8444-444444444444";

let admin: TestingUser;
let nonAdmin: TestingUser;

test.beforeAll(async () => {
    admin = await createTestUser({ admin: true });
    nonAdmin = await createTestUser();
    await seedWorkshops();
});

test.describe("workshop analytics dashboard", () => {
    test("non-admin gets a 404", async ({ page }) => {
        await loginAsUser(page, nonAdmin);
        const resp = await page.goto(`/admin/workshops/${ANY_WORKSHOP_ID}`);
        expect(resp?.status()).toBe(404);
    });

    test("admin reaches the dashboard and sees stat tiles", async ({ page }) => {
        await loginAsUser(page, admin);

        await page.goto("/admin/workshops");
        await expect(page.getByRole("heading", { name: "Workshops" })).toBeVisible({
            timeout: 15_000,
        });

        // Enter analytics via the persistent row action on the seeded workshop.
        const row = page.getByTestId("workshop-row").filter({ hasText: ACTIVE_WORKSHOP_NAME });
        await expect(row).toHaveCount(1);
        await row.getByTitle("View analytics").click();

        // Header + the stat tiles render. Tiles are label/value pairs; assert the
        // labels are present (values depend on seed state).
        await expect(page.getByRole("heading", { name: ACTIVE_WORKSHOP_NAME })).toBeVisible({
            timeout: 15_000,
        });
        await expect(page.getByText("Participants", { exact: true })).toBeVisible();
        await expect(page.getByText("Active", { exact: true })).toBeVisible();
        await expect(page.getByText("Tutorial completion", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
    });
});
