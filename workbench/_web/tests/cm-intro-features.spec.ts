import { test, expect, Page } from "@playwright/test";
import { execFileSync } from "node:child_process";

/**
 * UI E2E for the cm-intro workshop features. These run against seeded chart +
 * history data (see tests/seed-cm-intro.cjs) so they exercise the real
 * edulogitlens widget and the F1 history rail WITHOUT a model run / NDIF —
 * the behaviors under test are all front-end.
 *
 *   B1: the final-token row is rendered and in-viewport (not clipped).
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
    // CI runs the default Playwright config with no seed step and no
    // globalSetup, so seed the fixed chart + history here. seed-cm-intro.cjs
    // loads .env and writes to the same SQLite DB the server reads (e2e.db in
    // CI, local.db locally); its DELETE-then-INSERT is idempotent across
    // retries. Runs after the webServer is up, so the server sees the committed
    // rows on the next query.
    test.beforeAll(() => {
        execFileSync("node", ["tests/seed-cm-intro.cjs"], { stdio: "inherit" });
    });

    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 720 });
        // The CM Intro tutorial auto-starts on first visit (reactour) and
        // overlays the page, blocking the heatmap + rail. Mark it completed so
        // it stays closed — these tests aren't exercising the tour.
        await page.addInitScript(() =>
            localStorage.setItem("workbench:cm-intro-tutorial-completed:v1", "true"),
        );
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
        // The B1 bug omitted this row entirely (clipped by an auto-fit cap). It
        // must now render and be reachable in the scrollable heatmap, so scroll
        // it into view and confirm it's actually on screen (not cut off).
        await last.scrollIntoViewIfNeeded();
        await expect(last).toBeInViewport();
    });

    test("F1: history rail stacks runs; newest highlighted; click loads prompt", async ({
        page,
    }) => {
        // The prompt-history rail is collapsed by default — expand it first.
        await page.getByTitle("Show prompt history").click();
        const strips = historyStrips(page);
        await expect(strips).toHaveCount(3);

        // Newest first and highlighted; older ones dimmed (inactive).
        await expect(strips.first()).toHaveAttribute("data-active", "true");
        await expect(strips.nth(1)).toHaveAttribute("data-active", "false");

        // Strips show their final-token prediction.
        await expect(strips.filter({ hasText: "Rome," })).toHaveCount(1);

        // Clicking the "Rome," version restores it into the source composer.
        // A restore shows the tokenized CHIP view (not the raw textarea) — and on
        // the gpt2-only CI backend the run's model isn't re-selectable — so assert
        // against the source SECTION's text rather than a textarea value: it must
        // show the Rome prompt and NOT the "Rome not Paris" run (the only other
        // strip containing "Rome").
        await strips.filter({ hasText: "Rome," }).click();
        const sourceArea = page.locator("#cm-intro-source-prompt");
        await expect(sourceArea).toContainText("Rome");
        await expect(sourceArea).not.toContainText("Paris");
    });
});
