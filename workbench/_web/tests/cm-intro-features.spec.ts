import { test, expect, Page } from "@playwright/test";

/**
 * UI E2E for the cm-intro workshop features. These run against seeded chart +
 * history data (see tests/seed-cm-intro.cjs) so they exercise the real
 * edulogitlens widget, the D1 toggle, and the F1 history rail WITHOUT a model
 * run / NDIF — the behaviors under test are all front-end.
 *
 *   B1: the final-token row is rendered and in-viewport (not clipped).
 *   D1: the "Last row only" toggle collapses the heatmap to one row.
 *   F1: the history rail stacks one strip per past run, newest highlighted,
 *       and clicking a strip loads its prompt back into the source composer.
 */

const WS = "11111111-1111-4111-8111-111111111111";
const CHART = "22222222-2222-4222-8222-222222222222";
const URL = `/workbench/${WS}/cm-intro/${CHART}`;

// Token-column row labels are the only [title] elements in the display.
const tokenLabels = (page: Page) =>
    page.locator("#cm-intro-display .text-gray-700.truncate[title]");
const historyStrips = (page: Page) => page.locator('[data-testid="lens-history-strip"]');

test.describe("cm-intro workshop features (seeded, no NDIF)", () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.goto(URL);
        // Heatmap rendered once token labels appear.
        await expect(tokenLabels(page).first()).toBeVisible({ timeout: 30_000 });
    });

    test("B1: final-token row is rendered and in viewport (not clipped)", async ({ page }) => {
        const labels = tokenLabels(page);
        // Multiple rows render for the 12-token prompt.
        expect(await labels.count()).toBeGreaterThan(1);
        const last = labels.last();
        await expect(last).toHaveAttribute("title", ":"); // final fixture token
        // The B1 bug clipped this row below the 82vh fold; with the fix it must
        // be within the viewport.
        await expect(last).toBeInViewport();
    });

    test("D1: 'Last row only' collapses the heatmap to a single row", async ({ page }) => {
        expect(await tokenLabels(page).count()).toBeGreaterThan(1);

        await page.getByRole("checkbox", { name: /Last row only/i }).check();
        await expect(tokenLabels(page)).toHaveCount(1);
        await expect(tokenLabels(page).first()).toHaveAttribute("title", ":");

        await page.getByRole("checkbox", { name: /Last row only/i }).uncheck();
        await expect.poll(async () => await tokenLabels(page).count()).toBeGreaterThan(1);
    });

    test("F1: history rail stacks runs; newest highlighted; click loads prompt", async ({ page }) => {
        const strips = historyStrips(page);
        await expect(strips).toHaveCount(3);

        // Newest first and highlighted; older ones dimmed (inactive).
        await expect(strips.first()).toHaveAttribute("data-active", "true");
        await expect(strips.nth(1)).toHaveAttribute("data-active", "false");

        // Strips show their final-token prediction.
        await expect(strips.filter({ hasText: "Rome" })).toHaveCount(1);

        // Clicking the "Rome," version loads it into the source composer.
        await strips.filter({ hasText: "Rome" }).click();
        const sourceBox = page.getByPlaceholder(/Enter source prompt/i);
        await expect(sourceBox).toHaveValue(/Rome,/);
    });
});
