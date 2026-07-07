import { test, expect } from "@playwright/test";
import { createTestUser, loginAsUser, type TestingUser } from "./TestingUtils";
import { E2E_MODEL } from "./fixtures";

/**
 * UI E2E for the /admin/workshops CRUD surface. Runs under real auth as a
 * freshly-created admin user whose email is E2E_ADMIN_EMAIL — the address CI
 * puts in ADMIN_EMAILS, so getAdminEmail() allowlists it. Without an allowlisted
 * session the route 404s (the negative path); this suite covers the happy path.
 *
 * Creates a workshop through the dialog, checks the row, and deletes it via
 * the confirmation popover. Uses a unique name per run so leftovers from
 * crashed runs never collide.
 */

const NAME = `E2E Admin Workshop ${Date.now()}`;

// Serial: create → assert → delete share state.
test.describe.configure({ mode: "serial" });

// Fresh admin user per file; log in before each test.
let admin: TestingUser;
test.beforeAll(async () => {
    admin = await createTestUser({ admin: true });
});
test.beforeEach(async ({ page }) => {
    await loginAsUser(page, admin);
});

test.describe("workshop admin CRUD", () => {
    test("create, list, and delete a workshop", async ({ page, context }) => {
        // The create flow copies the join link to the clipboard.
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);

        await page.goto("/admin/workshops");
        await expect(page.getByRole("heading", { name: "Workshops" })).toBeVisible({
            timeout: 15_000,
        });

        // Create
        await page.getByRole("button", { name: "New workshop" }).click();
        await page.getByLabel("Name").fill(NAME);
        // lens2 is pre-checked; add Patch Lens.
        await page.getByRole("checkbox").nth(2).check();
        // Model select is populated from the live backend catalog; until the
        // query resolves the field is a plain-Input fallback, so wait for the
        // Select (combobox) to swap in. The list is long and Radix Select
        // scrolls via its own buttons (unreachable for a plain click), so
        // select the E2E model via the built-in typeahead instead.
        const modelSelect = page.getByRole("combobox", { name: "Model" });
        await expect(modelSelect).toBeVisible({ timeout: 15_000 });
        await modelSelect.click();
        await expect(page.getByRole("option").first()).toBeVisible();
        await page.keyboard.type(E2E_MODEL);
        await expect(page.getByRole("option", { name: E2E_MODEL, exact: true })).toBeFocused();
        await page.keyboard.press("Enter");
        await page.getByLabel("Starter prompt").fill("The Eiffel Tower is in");
        await page.getByRole("button", { name: "Create workshop" }).click();
        // Wait for the dialog to fully unmount — Radix blocks pointer events
        // during its exit animation, which can swallow the next click.
        await expect(page.getByRole("dialog")).toHaveCount(0);

        // Row appears with tools, model, and a participant count. Scope to the
        // row for THIS run's unique name — the list is newest-first and other
        // runs' leftovers may be present.
        const row = page.getByTestId("workshop-row").filter({ hasText: NAME });
        await expect(row).toHaveCount(1);
        await expect(row.getByText("Logit Lens · Patch Lens")).toBeVisible();
        await expect(row.getByText("0 participants")).toBeVisible();

        // The join link landed on the clipboard and points at /w/{slug}.
        const clipboard = await page.evaluate(() => navigator.clipboard.readText());
        expect(clipboard).toMatch(/\/w\/[A-Za-z0-9_-]+$/);

        // Delete via the confirmation popover. Retry the open, but only click
        // the trigger while it's closed — a blind re-click toggles the popover
        // shut again, and its exit animation can spuriously pass a visibility
        // check. data-state is Radix's source of truth.
        const deleteTrigger = row.getByTitle("Delete workshop");
        const confirmDelete = page.getByRole("button", { name: "Delete", exact: true });
        await expect(async () => {
            if ((await deleteTrigger.getAttribute("data-state")) !== "open") {
                await deleteTrigger.click();
            }
            await expect(deleteTrigger).toHaveAttribute("data-state", "open", {
                timeout: 1_000,
            });
        }).toPass({ timeout: 15_000 });
        await confirmDelete.click();
        await expect(row).toHaveCount(0);
    });
});
