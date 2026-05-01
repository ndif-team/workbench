import { test, expect, argosScreenshot, REAL_NDIF_TIMEOUT_MS } from "./fixtures";

/**
 * Workshop Mode E2E. The route is a sibling of the existing /workbench routes
 * and is not authenticated — anonymous session-id cookie is the only identity.
 *
 * The pre-cached payload comes from the FastAPI backend's on-disk fixtures
 * (no live NDIF traffic). Backend must be up.
 */

const BRANCHING_ID = "branching_demo_fixture";
const COMMITMENT_ID = "commitment_strip_fixture";

test.describe("Workshop Mode", () => {
    test.setTimeout(REAL_NDIF_TIMEOUT_MS);

    test("index renders pre-cached examples and links work", async ({ workbenchPage: page }) => {
        await page.goto("/workshop");
        await expect(page.getByTestId("workshop-index")).toBeVisible({ timeout: 15_000 });

        const branchingLink = page.getByTestId(`workshop-link-${BRANCHING_ID}`);
        await expect(branchingLink).toBeVisible();
        await expect(branchingLink.getByRole("button")).toBeVisible();

        const commitmentLink = page.getByTestId(`workshop-link-${COMMITMENT_ID}`);
        await expect(commitmentLink).toBeVisible();
    });

    test("branching example page shows payload stub + chrome", async ({ workbenchPage: page }) => {
        await page.goto(`/workshop/${BRANCHING_ID}`);
        await expect(page.getByTestId("workshop-example-page")).toBeVisible({ timeout: 15_000 });
        await expect(page.getByTestId("payload-stub-branching")).toBeVisible();
        // Trajectory panels (visible side-by-side) — Wave 3 replaced the
        // earlier hidden `branching-sample-N` shorthand with these.
        await expect(page.getByTestId("trajectory-panel-0")).toBeVisible();
        await expect(page.getByTestId("trajectory-panel-1")).toBeVisible();
        await expect(page.getByTestId("trajectory-panel-2")).toBeVisible();
        await expect(page.getByTestId("workshop-task-header")).toBeVisible();
        await expect(page.getByTestId("annotation-pane")).toBeVisible();
        await expect(page.getByTestId("branching-indicator")).toBeVisible();

        await argosScreenshot(page, "workshop-mode-branching", { fullPage: false });
    });

    test("commitment-strip example page renders heat-strip", async ({
        workbenchPage: page,
    }) => {
        await page.goto(`/workshop/${COMMITMENT_ID}`);
        await expect(page.getByTestId("payload-stub-commitment-strip")).toBeVisible({
            timeout: 15_000,
        });
        await expect(page.getByTestId("commitment-strip")).toBeVisible();
        await expect(page.getByTestId("heat-strip-token-0")).toBeVisible();
        // The fixture has 5 tokens.
        await expect(page.getByTestId("heat-strip-token-4")).toBeVisible();
    });

    test("annotation persists across page reload via session cookie", async ({
        workbenchPage: page,
    }) => {
        await page.goto(`/workshop/${BRANCHING_ID}`);
        const ta = page.getByTestId("annotation-textarea");
        await expect(ta).toBeVisible({ timeout: 15_000 });

        const noteText = `note ${Date.now()}`;
        await ta.fill(noteText);

        // wait for debounced save flash
        await expect(page.getByTestId("annotation-saved-indicator")).toHaveAttribute(
            "data-state",
            "flashing",
            { timeout: 5_000 },
        );

        await page.reload();
        await expect(page.getByTestId("annotation-textarea")).toHaveValue(noteText, {
            timeout: 15_000,
        });
    });

    test("critical-framing prompt only appears after 'I see it' click", async ({
        workbenchPage: page,
    }) => {
        await page.goto(`/workshop/${BRANCHING_ID}`);
        await expect(page.getByTestId("workshop-example-page")).toBeVisible({ timeout: 15_000 });

        const framing = page.getByTestId("critical-framing");
        await expect(framing).toHaveAttribute("data-state", "hidden");
        await expect(page.getByTestId("critical-framing-text")).toHaveCount(0);

        await page.getByTestId("critical-framing-reveal").click();

        await expect(framing).toHaveAttribute("data-state", "revealed");
        await expect(page.getByTestId("critical-framing-text")).toBeVisible();
        await expect(page.getByTestId("critical-framing-response")).toBeVisible();
    });

    test("framing response saves and reloads", async ({ workbenchPage: page }) => {
        await page.goto(`/workshop/${BRANCHING_ID}`);
        await page.getByTestId("critical-framing-reveal").click();

        const response = `the model never paused ${Date.now()}`;
        await page.getByTestId("critical-framing-response").fill(response);

        const saveBtn = page.getByTestId("critical-framing-save");
        await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
        await saveBtn.click();
        // Wait for the server action's Set-Cookie + DB row to land before
        // reloading — without this, reload races the action.
        await page.waitForTimeout(1500);

        await page.reload();
        // Already-saved response means component opens revealed on reload.
        await expect(page.getByTestId("critical-framing")).toHaveAttribute(
            "data-state",
            "revealed",
            { timeout: 15_000 },
        );
        await expect(page.getByTestId("critical-framing-response")).toHaveValue(response);
    });

    test("session summary export downloads non-empty markdown", async ({
        workbenchPage: page,
    }) => {
        await page.goto(`/workshop/${BRANCHING_ID}`);
        await page.getByTestId("annotation-textarea").fill("a reflection");
        await page.waitForTimeout(1500); // let debounced save land

        const downloadPromise = page.waitForEvent("download");
        await page.getByTestId("session-summary-export").first().click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toBe("workshop-summary.md");

        const path = await download.path();
        const fs = await import("node:fs");
        const text = fs.readFileSync(path, "utf8");
        expect(text).toContain("Workshop session — your reflections");
        expect(text).toContain("a reflection");
    });

    test("branching indicator can be dismissed", async ({ workbenchPage: page }) => {
        await page.goto(`/workshop/${BRANCHING_ID}`);
        await expect(page.getByTestId("branching-indicator")).toBeVisible({ timeout: 15_000 });
        await page.getByTestId("branching-indicator-dismiss").click();
        await expect(page.getByTestId("branching-indicator")).toHaveCount(0);
    });

    test("nonexistent example returns 404", async ({ workbenchPage: page }) => {
        const resp = await page.goto("/workshop/does_not_exist_at_all");
        expect(resp?.status()).toBe(404);
    });
});
