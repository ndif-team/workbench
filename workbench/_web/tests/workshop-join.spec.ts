import { test, expect } from "@playwright/test";
import {
    seedWorkshops,
    supabase,
    ACTIVE_WORKSHOP_SLUG as ACTIVE_SLUG,
    EXPIRED_WORKSHOP_SLUG as EXPIRED_SLUG,
    WORKSHOP_STARTER_PROMPT as STARTER_PROMPT,
} from "./TestingUtils";

/**
 * UI E2E for the workshop join flow. Runs against seeded workshop rows under
 * REAL auth with anonymous sign-ins enabled — so visiting /w/{slug} in a fresh
 * (cookieless) context exercises the actual anonymous sign-in + service-role
 * claim stamping, plus slug validation, expiry, workspace + chart seeding, tool
 * gating, and model pinning. No user is logged in here on purpose.
 */

// Serial: these tests CREATE data (join mints a workspace) and the beforeAll
// seed DELETES prior participant workspaces — parallel workers would race.
test.describe.configure({ mode: "serial" });

test.describe("workshop join flow (seeded)", () => {
    // Seed here rather than in a globalSetup so retries re-seed (delete-then-
    // insert is idempotent and clears prior participant workspaces so each run
    // takes the fresh-join path).
    test.beforeAll(async () => {
        await seedWorkshops();
    });

    test("join link creates a workspace seeded with the workshop's tool + prompt", async ({
        page,
    }) => {
        await page.goto(`/w/${ACTIVE_SLUG}`);

        // The join action creates the workspace and redirects into the seeded
        // lens2 chart (the workshop's only allowed tool).
        await page.waitForURL(/\/workbench\/[^/]+\/lens2\/[^/]+/, { timeout: 30_000 });

        // Starter prompt is seeded into the chart config.
        const promptBox = page.getByPlaceholder(/Enter your prompt here/);
        await expect(promptBox).toBeVisible({ timeout: 15_000 });
        await expect(promptBox).toHaveValue(STARTER_PROMPT);

        // Tool gating: only the Logit Lens create button renders. (getByTitle
        // matches the visible list plus the sidebar's hidden measuring copy,
        // so assert visibility on the first and zero-count on the others.)
        await expect(page.getByTitle("New Logit Lens visualization").first()).toBeVisible();
        await expect(page.getByTitle("New Activation Patching")).toHaveCount(0);
        await expect(page.getByTitle("New Patch Lens")).toHaveCount(0);

        // Model pinning: the header pill is locked to the workshop model.
        const lockedPill = page.getByLabel("Model is set by the workshop");
        await expect(lockedPill).toBeVisible({ timeout: 15_000 });
        await expect(lockedPill).toContainText("gpt2");
    });

    test("anonymous join stamps the workshop claim on the new user", async ({ page }) => {
        // Fresh cookieless context → the join action signs the visitor in
        // anonymously and stamps app_metadata.workshop_slug via the service role.
        await page.goto(`/w/${ACTIVE_SLUG}`);
        await page.waitForURL(/\/workbench\/[^/]+\/lens2\/[^/]+/, { timeout: 30_000 });

        // The anonymous participant now exists in GoTrue carrying the claim.
        const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
        expect(error).toBeNull();
        const claimed = data.users.filter(
            (u) => (u.app_metadata as { workshop_slug?: string })?.workshop_slug === ACTIVE_SLUG,
        );
        expect(claimed.length).toBeGreaterThan(0);
        // The claim sits on an emailless (anonymous) account, not a real login.
        expect(claimed.some((u) => !u.email)).toBe(true);
    });

    test("re-clicking the join link reuses the existing workspace", async ({ page }) => {
        await page.goto(`/w/${ACTIVE_SLUG}`);
        await page.waitForURL(/\/workbench\/[^/]+\/lens2\/[^/]+/, { timeout: 30_000 });
        const firstUrl = page.url();

        await page.goto(`/w/${ACTIVE_SLUG}`);
        await page.waitForURL(/\/workbench\/[^/]+\/lens2\/[^/]+/, { timeout: 30_000 });
        expect(page.url()).toBe(firstUrl);
    });

    test("expired workshop shows the ended card and mints nothing", async ({ page }) => {
        await page.goto(`/w/${EXPIRED_SLUG}`);
        await expect(page.getByText("This workshop has ended")).toBeVisible({ timeout: 15_000 });
        // Stays on the join URL — no workspace redirect.
        expect(page.url()).toContain(`/w/${EXPIRED_SLUG}`);
    });

    test("unknown slug 404s", async ({ page }) => {
        const response = await page.goto("/w/definitely-not-a-real-slug");
        expect(response?.status()).toBe(404);
    });
});
