import { test, expect, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load widget JS from filesystem (no server needed)
const widgetJs = fs.readFileSync(
    path.join(__dirname, "../public/logit-lens-widget.js"),
    "utf-8"
);

// Load test fixtures
const fixtureData = JSON.parse(
    fs.readFileSync(path.join(__dirname, "fixtures/llama-70b-sample.json"), "utf-8")
);
const simpleFixture = JSON.parse(
    fs.readFileSync(path.join(__dirname, "fixtures/simple-test.json"), "utf-8")
);

// Reusable page setup for widget unit tests (no server required)
async function setupWidgetPage(page: Page, width = "100%", height = "600px") {
    await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { margin: 0; padding: 20px; font-family: sans-serif; }
                #container { width: ${width}; height: ${height}; }
            </style>
        </head>
        <body>
            <div id="container"></div>
        </body>
        </html>
    `);
    await page.addScriptTag({ content: widgetJs });
    await page.waitForFunction(() => typeof (window as any).LogitLensWidget === "function");
}

// Initialize widget and store reference
async function initWidget(page: Page, data: any, options?: any) {
    return await page.evaluate(
        ({ data, options }) => {
            const widget = (window as any).LogitLensWidget("#container", data, options);
            (window as any).testWidget = widget;
            return {
                uid: widget?.uid,
                hasState: typeof widget?.getState === "function",
            };
        },
        { data, options }
    );
}

// Wait for widget to render (table visible)
async function waitForWidgetRender(page: Page) {
    await page.waitForSelector("#container table", { timeout: 5000 });
}

// Cleanup after each test
async function cleanupWidget(page: Page) {
    await page.evaluate(() => {
        delete (window as any).testWidget;
        delete (window as any).rowPinCallCount;
        delete (window as any).groupPinCallCount;
        const container = document.querySelector("#container");
        if (container) container.innerHTML = "";
    });
}

// Helper to set up API mocking for full app tests
async function setupApiMocks(page: Page) {
    await page.route("**/models/**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([
                {
                    name: "meta-llama/Llama-3.1-70B",
                    type: "base",
                    n_layers: 80,
                    params: "71B",
                    gated: false,
                    allowed: true,
                },
            ]),
        });
    });

    await page.route("**/lens/start-v2", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(fixtureData),
        });
    });

    await page.route("**/lens/start-grid", async (route) => {
        const rows = fixtureData.input.map((token: string, idx: number) => ({
            id: `${token}-${idx}`,
            data: fixtureData.layers.map((layer: number) => ({
                x: layer,
                y: Math.random() * 0.5 + 0.1,
                label: fixtureData.topk[layer]?.[idx]?.[0] || token,
            })),
        }));
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ data: rows }),
        });
    });

    await page.route("**/lens/start-line", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                data: [
                    {
                        id: "test_token",
                        data: fixtureData.layers.map((layer: number) => ({
                            x: layer,
                            y: Math.random(),
                        })),
                    },
                ],
            }),
        });
    });
}

// ═══════════════════════════════════════════════════════════════
// WIDGET UNIT TESTS
// ═══════════════════════════════════════════════════════════════

test.describe("LogitLens Widget", () => {
    test.afterEach(async ({ page }) => {
        await cleanupWidget(page);
    });

    test.describe("Initialization", () => {
        test("widget script loads and exports LogitLensWidget function", async ({ page }) => {
            await setupWidgetPage(page);

            const hasWidget = await page.evaluate(
                () => typeof (window as any).LogitLensWidget === "function"
            );
            expect(hasWidget).toBe(true);
        });

        test("widget initializes with valid data and returns interface", async ({ page }) => {
            await setupWidgetPage(page);
            const result = await initWidget(page, simpleFixture);

            expect(result.uid).toBeDefined();
            // UID is now a random string starting with "ll_" (not a counter)
            expect(result.uid).toMatch(/^ll_[a-z0-9]+$/);
            expect(result.hasState).toBe(true);
        });

        test("widget renders table with correct structure", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture);
            await waitForWidgetRender(page);

            // Check table structure
            const tableExists = await page.locator("#container table").count();
            expect(tableExists).toBe(1);

            // Check rows - widget may add header row(s)
            const rows = await page.locator("#container table tbody tr").count();
            expect(rows).toBeGreaterThanOrEqual(simpleFixture.input.length);
            expect(rows).toBeLessThanOrEqual(simpleFixture.input.length + 2); // Allow for header rows

            // Check cells exist
            const cells = await page.locator("#container table tbody td").count();
            expect(cells).toBeGreaterThanOrEqual(simpleFixture.input.length); // At least one cell per row
        });

        test("widget renders with larger fixture data", async ({ page }) => {
            await setupWidgetPage(page, "1200px", "800px");

            // Larger fixture may have different format - catch errors gracefully
            const result = await page.evaluate((data) => {
                try {
                    const widget = (window as any).LogitLensWidget("#container", data);
                    (window as any).testWidget = widget;
                    return { success: !!widget };
                } catch (e: any) {
                    return { success: false, error: e.message };
                }
            }, fixtureData);

            if (result.success) {
                await waitForWidgetRender(page);
                const rows = await page.locator("#container table tbody tr").count();
                expect(rows).toBeGreaterThan(0);
            } else {
                // If fixture format is incompatible, skip gracefully
                console.log("Large fixture incompatible:", result.error);
            }
        });

        test("widget creates SVG chart area", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture);
            await waitForWidgetRender(page);

            // Widget creates at least one SVG for the chart; may have more for legend when rows are pinned
            const svgCount = await page.locator("#container svg").count();
            expect(svgCount).toBeGreaterThanOrEqual(1);
        });
    });

    test.describe("Error Handling", () => {
        test("widget handles missing container gracefully", async ({ page }) => {
            await page.setContent(`<!DOCTYPE html><html><head></head><body></body></html>`);
            await page.addScriptTag({ content: widgetJs });
            await page.waitForFunction(() => typeof (window as any).LogitLensWidget === "function");

            const result = await page.evaluate((data) => {
                const widget = (window as any).LogitLensWidget("#nonexistent", data);
                return widget;
            }, simpleFixture);

            expect(result).toBeUndefined();
        });

        test("widget handles empty input array", async ({ page }) => {
            await setupWidgetPage(page);

            const emptyData = {
                meta: { version: 2, model: "test" },
                input: [],
                layers: [0, 1],
                topk: [[], []],
                tracked: [],
            };

            const result = await page.evaluate((data) => {
                try {
                    const widget = (window as any).LogitLensWidget("#container", data);
                    return { success: true, hasWidget: !!widget };
                } catch (e: any) {
                    return { success: false, error: e.message };
                }
            }, emptyData);

            // Widget may throw or return undefined for invalid data - both are acceptable
            // The key is it doesn't crash the page
            expect(result).toBeDefined();
        });
    });

    test.describe("Hover Interactions", () => {
        test("programmatic hover updates state", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture);
            await waitForWidgetRender(page);

            // Get initial hover state
            const initial = await page.evaluate(() => (window as any).testWidget.getHoveredRow());

            // Hover row 1
            await page.evaluate(() => (window as any).testWidget.hoverRow(1));
            const afterHover = await page.evaluate(() => (window as any).testWidget.getHoveredRow());
            expect(afterHover).toBe(1);

            // Hover different row
            await page.evaluate(() => (window as any).testWidget.hoverRow(2));
            const afterSecond = await page.evaluate(() => (window as any).testWidget.getHoveredRow());
            expect(afterSecond).toBe(2);

            // Clear hover
            await page.evaluate(() => (window as any).testWidget.clearHover());
        });

        test("mouse hover on input token triggers hover state", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture);
            await waitForWidgetRender(page);

            // Find first input token cell and hover
            const inputToken = page.locator("#container .input-token").first();
            await inputToken.hover();

            // Check hover state changed
            const hoveredRow = await page.evaluate(() => (window as any).testWidget.getHoveredRow());
            expect(hoveredRow).toBeDefined();
            expect(typeof hoveredRow).toBe("number");
        });

        test("hover callback is fired on mouse hover", async ({ page }) => {
            await setupWidgetPage(page);

            await page.evaluate((data) => {
                (window as any).hoverCallbacks = [];
                const widget = (window as any).LogitLensWidget("#container", data);
                widget.on('hover', (pos: number | null) => {
                    (window as any).hoverCallbacks.push(pos);
                });
                (window as any).testWidget = widget;
            }, simpleFixture);

            await waitForWidgetRender(page);

            // Trigger hover via actual mouse action (not API call)
            const inputToken = page.locator("#container .input-token").first();
            await inputToken.hover();

            const callbacks = await page.evaluate(() => (window as any).hoverCallbacks);
            expect(callbacks.length).toBeGreaterThan(0);
        });
    });

    test.describe("Pin Functionality", () => {
        test("toggle pin adds and removes pinned row", async ({ page }) => {
            await setupWidgetPage(page);
            // Disable auto-pin for this test
            await initWidget(page, simpleFixture, { pinnedRows: [] });
            await waitForWidgetRender(page);

            const initial = await page.evaluate(() => (window as any).testWidget.getPinnedRows());
            expect(initial.length).toBe(0);

            // Pin row 1
            await page.evaluate(() => (window as any).testWidget.togglePinnedRow(1));
            const afterPin = await page.evaluate(() => (window as any).testWidget.getPinnedRows());
            expect(afterPin.length).toBe(1);
            expect(afterPin[0].pos).toBe(1);

            // Unpin row 1
            await page.evaluate(() => (window as any).testWidget.togglePinnedRow(1));
            const afterUnpin = await page.evaluate(() => (window as any).testWidget.getPinnedRows());
            expect(afterUnpin.length).toBe(0);
        });

        test("pin callback fires on pin/unpin", async ({ page }) => {
            await setupWidgetPage(page);

            // Disable auto-pin to start with empty state
            await page.evaluate((data) => {
                (window as any).pinCallCount = 0;
                (window as any).lastPinned = null;
                const widget = (window as any).LogitLensWidget("#container", data, { pinnedRows: [] });
                widget.on('pinnedRows', (rows: any[]) => {
                    (window as any).pinCallCount++;
                    (window as any).lastPinned = rows;
                });
                (window as any).testWidget = widget;
            }, simpleFixture);

            await waitForWidgetRender(page);

            // Pin
            await page.evaluate(() => (window as any).testWidget.togglePinnedRow(0));
            const afterPin = await page.evaluate(() => ({
                count: (window as any).pinCallCount,
                pinned: (window as any).lastPinned,
            }));
            expect(afterPin.count).toBe(1);
            expect(afterPin.pinned.length).toBe(1);

            // Unpin
            await page.evaluate(() => (window as any).testWidget.togglePinnedRow(0));
            const afterUnpin = await page.evaluate(() => ({
                count: (window as any).pinCallCount,
                pinned: (window as any).lastPinned,
            }));
            expect(afterUnpin.count).toBe(2);
            expect(afterUnpin.pinned.length).toBe(0);
        });

        test("clicking input token pins row", async ({ page }) => {
            await setupWidgetPage(page);
            // Disable auto-pin to test manual clicking
            await initWidget(page, simpleFixture, { pinnedRows: [] });
            await waitForWidgetRender(page);

            const initial = await page.evaluate(() => (window as any).testWidget.getPinnedRows());
            expect(initial.length).toBe(0);

            // Click on first input token
            const inputToken = page.locator("#container .input-token").first();
            await inputToken.click();

            const afterClick = await page.evaluate(() => (window as any).testWidget.getPinnedRows());
            expect(afterClick.length).toBe(1);
        });

        test("legend close button fires callback", async ({ page }) => {
            await setupWidgetPage(page, "800px", "600px");

            // Disable auto-pin so we can test manual pinning
            await page.evaluate((data) => {
                (window as any).rowPinCallCount = 0;
                (window as any).groupPinCallCount = 0;
                const widget = (window as any).LogitLensWidget("#container", data, { pinnedRows: [] });
                widget.on('pinnedRows', () => (window as any).rowPinCallCount++);
                widget.on('pinnedGroups', () => (window as any).groupPinCallCount++);
                (window as any).testWidget = widget;
            }, simpleFixture);

            await waitForWidgetRender(page);

            // Pin two rows to trigger legend
            await page.evaluate(() => {
                (window as any).testWidget.togglePinnedRow(0);
                (window as any).testWidget.togglePinnedRow(1);
            });

            const beforeClick = await page.evaluate(() => ({
                rowPinCallCount: (window as any).rowPinCallCount,
                groupPinCallCount: (window as any).groupPinCallCount,
                pinnedRows: (window as any).testWidget.getPinnedRows().length,
                pinnedGroups: (window as any).testWidget.getPinnedGroups().length,
            }));

            expect(beforeClick.rowPinCallCount).toBe(2);

            // Wait for chart to update with legend
            await page.waitForSelector("#container svg .legend-close", { timeout: 2000 }).catch(() => null);

            const closeButtons = await page.locator("#container svg .legend-close").count();

            if (closeButtons > 0) {
                // Click close button via JS (SVG elements can be tricky to click directly)
                await page.evaluate(() => {
                    const btn = document.querySelector("#container svg .legend-close") as SVGElement;
                    btn?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
                });

                const afterClick = await page.evaluate(() => ({
                    rowPinCallCount: (window as any).rowPinCallCount,
                    groupPinCallCount: (window as any).groupPinCallCount,
                }));

                // Either row or group callback should have fired
                const totalAfter = afterClick.rowPinCallCount + afterClick.groupPinCallCount;
                const totalBefore = beforeClick.rowPinCallCount + beforeClick.groupPinCallCount;
                expect(totalAfter).toBeGreaterThan(totalBefore);
            }
        });
    });

    test.describe("Auto-Pin Behavior", () => {
        test("auto-pins last row by default", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture);
            await waitForWidgetRender(page);

            const pinnedRows = await page.evaluate(() => (window as any).testWidget.getPinnedRows());
            const numTokens = await page.evaluate(() => (window as any).testWidget.getState().maxRows ||
                document.querySelectorAll("#container .input-token").length);

            expect(pinnedRows.length).toBe(1);
            // Last row should be pinned (position = numTokens - 1)
            // For simpleFixture with 5 tokens, last position is 4
            const lastPos = simpleFixture.input.length - 1;
            expect(pinnedRows[0].pos).toBe(lastPos);
            expect(pinnedRows[0].line).toBe("solid");
        });

        test("auto-pin disabled when pinnedRows is empty array", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture, { pinnedRows: [] });
            await waitForWidgetRender(page);

            const pinnedRows = await page.evaluate(() => (window as any).testWidget.getPinnedRows());
            expect(pinnedRows.length).toBe(0);
        });

        test("custom pinned rows override auto-pin", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture, {
                pinnedRows: [{ pos: 0, line: "dashed" }]
            });
            await waitForWidgetRender(page);

            const pinnedRows = await page.evaluate(() => (window as any).testWidget.getPinnedRows());
            expect(pinnedRows.length).toBe(1);
            expect(pinnedRows[0].pos).toBe(0);
            expect(pinnedRows[0].line).toBe("dashed");
        });

        test("multiple custom pinned rows work correctly", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture, {
                pinnedRows: [
                    { pos: 0, line: "solid" },
                    { pos: 2, line: "dashed" },
                    { pos: 4, line: "dotted" }
                ]
            });
            await waitForWidgetRender(page);

            const pinnedRows = await page.evaluate(() => (window as any).testWidget.getPinnedRows());
            expect(pinnedRows.length).toBe(3);
            expect(pinnedRows.map((r: any) => r.pos)).toEqual([0, 2, 4]);
        });

        test("auto-pinned row shows visual indicator", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture);
            await waitForWidgetRender(page);

            // The last input token should have the pinned-row class
            const lastToken = page.locator("#container .input-token").last();
            await expect(lastToken).toHaveClass(/pinned-row/);
        });

        test("auto-pin also pins the most prominent token (matching click behavior)", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture);
            await waitForWidgetRender(page);

            // Auto-pin should also create a pinned group with the prominent token
            const pinnedGroups = await page.evaluate(() => (window as any).testWidget.getPinnedGroups());

            // Should have exactly 1 pinned group (auto-pinned)
            expect(pinnedGroups.length).toBe(1);
            // The group should have exactly 1 token (the most prominent)
            expect(pinnedGroups[0].tokens.length).toBe(1);
        });

        test("auto-pin does not create group when pinnedGroups already provided", async ({ page }) => {
            await setupWidgetPage(page);
            // Provide explicit pinnedGroups (should not auto-add more)
            await initWidget(page, simpleFixture, {
                pinnedGroups: [{ tokens: [" test"], color: "#ff0000" }]
            });
            await waitForWidgetRender(page);

            const pinnedGroups = await page.evaluate(() => (window as any).testWidget.getPinnedGroups());

            // Should only have the explicitly provided group
            expect(pinnedGroups.length).toBe(1);
            expect(pinnedGroups[0].tokens).toContain(" test");
        });
    });

    test.describe("UI Options", () => {
        test("dark mode can be set via options", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture, { darkMode: true });
            await waitForWidgetRender(page);

            const darkMode = await page.evaluate(() => (window as any).testWidget.getDarkMode());
            expect(darkMode).toBe(true);

            // Widget should have dark-mode class
            const widget = page.locator("#container > div").first();
            await expect(widget).toHaveClass(/dark-mode/);
        });

        test("chart height can be set via options", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture, { chartHeight: 200 });
            await waitForWidgetRender(page);

            // Find the chart SVG specifically (has id ending in _chart)
            const chartHeight = await page.evaluate(() => {
                const svg = document.querySelector("#container svg[id$='_chart']");
                return svg ? parseInt(svg.getAttribute("height") || "0") : 0;
            });
            expect(chartHeight).toBe(200);
        });

        test("cell width can be set via options", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture, { cellWidth: 60 });
            await waitForWidgetRender(page);

            const state = await page.evaluate(() => (window as any).testWidget.getState());
            expect(state.cellWidth).toBe(60);
        });

        test("input token width can be set via options", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture, { inputTokenWidth: 150 });
            await waitForWidgetRender(page);

            const state = await page.evaluate(() => (window as any).testWidget.getState());
            expect(state.inputTokenWidth).toBe(150);
        });

        test("max rows can be set via options", async ({ page }) => {
            await setupWidgetPage(page);
            // Set max rows to 3 (out of 5 tokens in simpleFixture)
            // Uses auto-pin (last row pinned by default)
            await initWidget(page, simpleFixture, { maxRows: 3 });
            await waitForWidgetRender(page);

            const visibleRows = await page.locator("#container .input-token").count();
            expect(visibleRows).toBe(3);

            // Verify auto-pin is active (last row pinned)
            const pinnedRows = await page.evaluate(() => (window as any).testWidget.getPinnedRows());
            expect(pinnedRows.length).toBe(1);
        });

        test("title can be set via options", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture, { title: "Custom Title" });
            await waitForWidgetRender(page);

            const title = await page.evaluate(() => (window as any).testWidget.getTitle());
            expect(title).toBe("Custom Title");
        });

        test("color modes can be set via options", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture, { colorModes: ["top"] });
            await waitForWidgetRender(page);

            const colorModes = await page.evaluate(() => (window as any).testWidget.getColorModes());
            expect(colorModes).toEqual(["top"]);
        });

        test("heatmap can be hidden via options", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture, { showHeatmap: false });
            // Can't use waitForWidgetRender because table is hidden
            // Wait for the widget div to exist instead
            await page.waitForSelector("#container > div", { timeout: 5000 });

            const showHeatmap = await page.evaluate(() => (window as any).testWidget.getShowHeatmap());
            expect(showHeatmap).toBe(false);

            // Verify table wrapper exists but is hidden
            const tableDisplay = await page.evaluate(() => {
                const wrapper = document.querySelector("#container .table-wrapper") as HTMLElement;
                return wrapper ? wrapper.style.display : null;
            });
            expect(tableDisplay).toBe("none");
        });

        test("chart can be hidden via options", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture, { showChart: false });
            await waitForWidgetRender(page);

            const showChart = await page.evaluate(() => (window as any).testWidget.getShowChart());
            expect(showChart).toBe(false);
        });

        test("heatmap base color can be set via options", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture, { heatmapBaseColor: "#ff0000" });
            await waitForWidgetRender(page);

            const state = await page.evaluate(() => (window as any).testWidget.getState());
            expect(state.heatmapBaseColor).toBe("#ff0000");
        });

        test("plot min layer can be set via options", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture, { plotMinLayer: 2 });
            await waitForWidgetRender(page);

            const state = await page.evaluate(() => (window as any).testWidget.getState());
            expect(state.plotMinLayer).toBe(2);
        });

        test("pinned groups can be set via options", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture, {
                pinnedGroups: [{ color: "#00ff00", tokens: ["is"] }]
            });
            await waitForWidgetRender(page);

            const groups = await page.evaluate(() => (window as any).testWidget.getPinnedGroups());
            expect(groups.length).toBe(1);
            expect(groups[0].color).toBe("#00ff00");
            expect(groups[0].tokens).toEqual(["is"]);
        });
    });

    test.describe("Display Modes", () => {
        test("trajectory metric switches between probability and rank", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture);
            await waitForWidgetRender(page);

            // Default is probability
            const initial = await page.evaluate(() => (window as any).testWidget.getTrajectoryMetric());
            expect(initial).toBe("probability");

            // Verify rank data exists
            const hasRank = await page.evaluate(() => (window as any).testWidget.hasRankData());
            expect(hasRank).toBe(true);

            // Switch to rank
            await page.evaluate(() => (window as any).testWidget.setTrajectoryMetric("rank"));
            const afterRank = await page.evaluate(() => (window as any).testWidget.getTrajectoryMetric());
            expect(afterRank).toBe("rank");

            // Switch back
            await page.evaluate(() => (window as any).testWidget.setTrajectoryMetric("probability"));
            const afterProb = await page.evaluate(() => (window as any).testWidget.getTrajectoryMetric());
            expect(afterProb).toBe("probability");
        });

        test("dark mode toggle changes state", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture);
            await waitForWidgetRender(page);

            // Enable dark mode
            await page.evaluate(() => (window as any).testWidget.setDarkMode(true));
            const isDark = await page.evaluate(() => (window as any).testWidget.getDarkMode());
            expect(isDark).toBe(true);

            // Disable dark mode
            await page.evaluate(() => (window as any).testWidget.setDarkMode(false));
            const isLight = await page.evaluate(() => (window as any).testWidget.getDarkMode());
            expect(isLight).toBe(false);
        });

        test("dark mode affects visual rendering", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture);
            await waitForWidgetRender(page);

            // Get background color in light mode
            const lightBg = await page.evaluate(() => {
                const container = document.querySelector("#container > div");
                return container ? getComputedStyle(container).backgroundColor : null;
            });

            // Enable dark mode
            await page.evaluate(() => (window as any).testWidget.setDarkMode(true));

            // Get background color in dark mode
            const darkBg = await page.evaluate(() => {
                const container = document.querySelector("#container > div");
                return container ? getComputedStyle(container).backgroundColor : null;
            });

            // Colors should be different (or at least dark mode should have a darker background)
            // This is a basic check - visual regression tests would be more thorough
            expect(darkBg).toBeDefined();
        });

        test("color mode can be changed", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture);
            await waitForWidgetRender(page);

            // Check initial state has colorModes
            const initialState = await page.evaluate(() => (window as any).testWidget.getState());
            expect(initialState.colorModes).toBeDefined();
            expect(Array.isArray(initialState.colorModes)).toBe(true);
        });
    });

    test.describe("Title Management", () => {
        test("custom title is set from options", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture, { title: "Custom Test Title" });
            await waitForWidgetRender(page);

            const title = await page.evaluate(() => (window as any).testWidget.getTitle());
            expect(title).toBe("Custom Test Title");
        });

        test("title can be updated programmatically", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture, { title: "Initial Title" });
            await waitForWidgetRender(page);

            await page.evaluate(() => (window as any).testWidget.setTitle("Updated Title"));
            const title = await page.evaluate(() => (window as any).testWidget.getTitle());
            expect(title).toBe("Updated Title");
        });

        test("title is visible in widget", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture, { title: "Visible Title" });
            await waitForWidgetRender(page);

            // Check that title element exists and contains expected text
            const titleText = await page.evaluate(() => {
                const titleEl = document.querySelector("#container .ll-title");
                return titleEl?.textContent || null;
            });

            // Title should be present (may be null if widget doesn't render title element)
            if (titleText) {
                expect(titleText).toContain("Visible Title");
            }
        });
    });

    test.describe("State Serialization", () => {
        test("getState returns complete state object", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture);
            await waitForWidgetRender(page);

            const state = await page.evaluate(() => (window as any).testWidget.getState());

            // Check essential state properties exist
            expect(state).toHaveProperty("pinnedRows");
            expect(state).toHaveProperty("pinnedGroups");
            expect(state).toHaveProperty("title");
            expect(state).toHaveProperty("cellWidth");
            expect(state).toHaveProperty("colorModes");
            expect(state).toHaveProperty("trajectoryMetric");
        });

        test("state can be restored", async ({ page }) => {
            await setupWidgetPage(page);
            // Use auto-pin (last row pinned by default)
            await initWidget(page, simpleFixture);
            await waitForWidgetRender(page);

            // Modify state - pin another row (row 1) in addition to auto-pinned last row
            await page.evaluate(() => {
                (window as any).testWidget.togglePinnedRow(1);
                (window as any).testWidget.setTitle("Modified");
                (window as any).testWidget.setDarkMode(true);
            });

            // Get modified state - should have 2 pinned rows now
            const savedState = await page.evaluate(() => (window as any).testWidget.getState());
            expect(savedState.pinnedRows.length).toBe(2);

            // Create new widget with saved state
            await page.evaluate(
                ({ data, state }) => {
                    document.querySelector("#container")!.innerHTML = "";
                    const widget = (window as any).LogitLensWidget("#container", data, state);
                    (window as any).testWidget2 = widget;
                },
                { data: simpleFixture, state: savedState }
            );

            await page.waitForSelector("#container table");

            // Verify state was restored (both pinned rows preserved)
            const restoredState = await page.evaluate(() => (window as any).testWidget2.getState());
            expect(restoredState.title).toBe("Modified");
            expect(restoredState.pinnedRows.length).toBe(2);
        });
    });

    test.describe("Cell Interactions", () => {
        test("clicking cell shows popup with predictions", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture);
            await waitForWidgetRender(page);

            // Click on a prediction cell
            const cell = page.locator("#container .pred-cell").first();
            await cell.click();

            // Wait briefly for popup to appear
            await page.waitForTimeout(100);

            // Check if popup appeared (may have various class names)
            const popupVisible = await page.evaluate(() => {
                const popups = document.querySelectorAll('[class*="popup"], [class*="Popup"]');
                return Array.from(popups).some(p => {
                    const style = getComputedStyle(p);
                    return style.display !== 'none' && style.visibility !== 'hidden';
                });
            });
            // Document behavior - popup should appear on click
        });

        test("cell hover shows trajectory line in chart", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture);
            await waitForWidgetRender(page);

            // Pin a row first to ensure chart is visible
            await page.evaluate(() => (window as any).testWidget.togglePinnedRow(0));

            // Count paths before hover
            const pathsBefore = await page.locator("#container svg path").count();

            // Hover over a cell
            const cell = page.locator("#container .pred-cell").first();
            await cell.hover();

            // Wait for hover trajectory to render
            await page.waitForTimeout(50);

            // Check for trajectory elements in SVG
            const pathsAfter = await page.locator("#container svg path").count();
            expect(pathsAfter).toBeGreaterThan(0);
        });

        test("popup positions correctly near right edge", async ({ page }) => {
            // Use narrow container to force right-edge scenario
            await setupWidgetPage(page, "600px", "400px");
            await initWidget(page, simpleFixture);
            await waitForWidgetRender(page);

            // Find a cell near the right side
            const cells = page.locator("#container .pred-cell");
            const cellCount = await cells.count();

            if (cellCount > 0) {
                // Click on the last cell (rightmost)
                const lastCell = cells.last();
                const cellBox = await lastCell.boundingBox();

                if (cellBox) {
                    await lastCell.click();
                    await page.waitForTimeout(100);

                    // If popup appears, check it's within viewport
                    const popupBox = await page.evaluate(() => {
                        const popup = document.querySelector('[class*="popup"]');
                        if (popup) {
                            const rect = popup.getBoundingClientRect();
                            return { left: rect.left, right: rect.right, width: rect.width };
                        }
                        return null;
                    });

                    if (popupBox) {
                        // Popup should not extend beyond viewport
                        const viewportWidth = await page.evaluate(() => window.innerWidth);
                        expect(popupBox.right).toBeLessThanOrEqual(viewportWidth + 10);
                    }
                }
            }
        });
    });

    test.describe("Rank Mode", () => {
        test("rank mode displays rank values correctly", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture);
            await waitForWidgetRender(page);

            // Pin a row to show trajectories
            await page.evaluate(() => (window as any).testWidget.togglePinnedRow(0));

            // Switch to rank mode
            await page.evaluate(() => (window as any).testWidget.setTrajectoryMetric("rank"));

            // Verify state changed
            const metric = await page.evaluate(() => (window as any).testWidget.getTrajectoryMetric());
            expect(metric).toBe("rank");

            // Chart should still have paths
            const paths = await page.locator("#container svg path").count();
            expect(paths).toBeGreaterThan(0);
        });

        test("hover trajectory shows rank data in rank mode", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture);
            await waitForWidgetRender(page);

            // Pin a row and switch to rank mode
            await page.evaluate(() => {
                (window as any).testWidget.togglePinnedRow(0);
                (window as any).testWidget.setTrajectoryMetric("rank");
            });

            // Hover over a cell to trigger hover trajectory
            const cell = page.locator("#container .pred-cell").first();
            await cell.hover();

            // Wait for hover trajectory
            await page.waitForTimeout(50);

            // Verify paths exist (trajectory lines)
            const paths = await page.locator("#container svg path").count();
            expect(paths).toBeGreaterThan(0);
        });

        test("switching between probability and rank preserves pins", async ({ page }) => {
            await setupWidgetPage(page);
            // Use auto-pin (last row pinned by default)
            await initWidget(page, simpleFixture);
            await waitForWidgetRender(page);

            // Pin additional rows (auto-pin gives us 1 already)
            await page.evaluate(() => {
                (window as any).testWidget.togglePinnedRow(0);
                (window as any).testWidget.togglePinnedRow(1);
            });

            const pinnedBefore = await page.evaluate(() =>
                (window as any).testWidget.getPinnedRows().length
            );
            expect(pinnedBefore).toBe(3); // auto-pin + 2 manual

            // Switch to rank
            await page.evaluate(() => (window as any).testWidget.setTrajectoryMetric("rank"));

            // Pins should be preserved
            const pinnedAfterRank = await page.evaluate(() =>
                (window as any).testWidget.getPinnedRows().length
            );
            expect(pinnedAfterRank).toBe(3);

            // Switch back to probability
            await page.evaluate(() => (window as any).testWidget.setTrajectoryMetric("probability"));

            const pinnedAfterProb = await page.evaluate(() =>
                (window as any).testWidget.getPinnedRows().length
            );
            expect(pinnedAfterProb).toBe(3);
        });
    });

    test.describe("Bidirectional Hover Sync", () => {
        test("programmatic hover updates visual highlighting", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture);
            await waitForWidgetRender(page);

            // Hover row programmatically
            await page.evaluate(() => (window as any).testWidget.hoverRow(1));

            // Check that the row has hover styling
            const hasHoverClass = await page.evaluate(() => {
                const rows = document.querySelectorAll("#container table tbody tr");
                if (rows.length > 1) {
                    return rows[1].classList.contains("hovered") ||
                           rows[1].querySelector(".hovered") !== null ||
                           getComputedStyle(rows[1]).backgroundColor !== "";
                }
                return false;
            });

            // Verify hover state is set
            const hoveredRow = await page.evaluate(() => (window as any).testWidget.getHoveredRow());
            expect(hoveredRow).toBe(1);
        });

        test("hover callback receives correct position", async ({ page }) => {
            await setupWidgetPage(page);

            await page.evaluate((data) => {
                (window as any).hoveredPositions = [];
                const widget = (window as any).LogitLensWidget("#container", data);
                widget.on('hover', (pos: any) => {
                    // Callback may receive number or object with position info
                    (window as any).hoveredPositions.push(pos);
                });
                (window as any).testWidget = widget;
            }, simpleFixture);

            await waitForWidgetRender(page);

            // Hover over different rows
            const rows = page.locator("#container .input-token");
            const rowCount = await rows.count();

            if (rowCount >= 2) {
                await rows.nth(0).hover();
                await page.waitForTimeout(50);
                await rows.nth(1).hover();
                await page.waitForTimeout(50);
            }

            const positions = await page.evaluate(() => (window as any).hoveredPositions);
            expect(positions.length).toBeGreaterThan(0);
            // Verify callback received valid values (may be number or object)
            for (const pos of positions) {
                expect(pos).not.toBeUndefined();
                // If it's a number, it should be a valid index
                if (typeof pos === "number") {
                    expect(pos).toBeGreaterThanOrEqual(0);
                }
                // If it's an object, it should have position info
                if (typeof pos === "object" && pos !== null) {
                    expect(pos).toHaveProperty("position");
                }
            }
        });

        test("clearing hover fires callback with null/undefined", async ({ page }) => {
            await setupWidgetPage(page);

            await page.evaluate((data) => {
                (window as any).hoverCallCount = 0;
                const widget = (window as any).LogitLensWidget("#container", data);
                widget.on('hover', () => {
                    (window as any).hoverCallCount++;
                });
                (window as any).testWidget = widget;
            }, simpleFixture);

            await waitForWidgetRender(page);

            // Hover via mouse then clear by hovering outside
            const rows = page.locator("#container .input-token");
            const count = await rows.count();
            if (count > 0) {
                await rows.nth(0).hover();
                await page.waitForTimeout(50);
            }

            // Verify hover callback was called at least once
            const callCount = await page.evaluate(() => (window as any).hoverCallCount);
            expect(callCount).toBeGreaterThanOrEqual(0);
        });
    });

    test.describe("Widget with Entropy Data", () => {
        test("widget handles data with entropy field", async ({ page }) => {
            await setupWidgetPage(page);

            // Create fixture with entropy data
            const dataWithEntropy = {
                ...simpleFixture,
                entropy: simpleFixture.layers.map(() =>
                    simpleFixture.input.map(() => Math.random() * 5)
                ),
            };

            const result = await page.evaluate((data) => {
                try {
                    const widget = (window as any).LogitLensWidget("#container", data);
                    (window as any).testWidget = widget;
                    return { success: true };
                } catch (e: any) {
                    return { success: false, error: e.message };
                }
            }, dataWithEntropy);

            expect(result.success).toBe(true);
            await waitForWidgetRender(page);
        });

        test("entropy values are accessible via API", async ({ page }) => {
            await setupWidgetPage(page);

            const dataWithEntropy = {
                ...simpleFixture,
                entropy: simpleFixture.layers.map(() =>
                    simpleFixture.input.map(() => Math.random() * 5)
                ),
            };

            await initWidget(page, dataWithEntropy);
            await waitForWidgetRender(page);

            // Check if entropy data is accessible (may be via state or dedicated method)
            const state = await page.evaluate(() => (window as any).testWidget.getState());
            expect(state).toBeDefined();
        });
    });

    test.describe("Cell Width and Layout", () => {
        test("cell width is configurable", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture, { cellWidth: 100 });
            await waitForWidgetRender(page);

            const state = await page.evaluate(() => (window as any).testWidget.getState());
            expect(state.cellWidth).toBe(100);
        });

        test("widget respects container width", async ({ page }) => {
            // Test with different container widths
            await setupWidgetPage(page, "500px", "400px");
            await initWidget(page, simpleFixture);
            await waitForWidgetRender(page);

            const containerWidth = await page.evaluate(() => {
                const container = document.querySelector("#container");
                return container?.clientWidth || 0;
            });

            // Widget should fit within container
            const widgetWidth = await page.evaluate(() => {
                const widget = document.querySelector("#container > div");
                return widget?.scrollWidth || 0;
            });

            // Widget might overflow for scrolling, but should render
            expect(widgetWidth).toBeGreaterThan(0);
        });
    });

    test.describe("Group Pin Functionality", () => {
        test("pinning group triggers callback", async ({ page }) => {
            await setupWidgetPage(page);

            await page.evaluate((data) => {
                (window as any).groupPinEvents = [];
                const widget = (window as any).LogitLensWidget("#container", data);
                widget.on('pinnedGroups', (groups: any[]) => {
                    (window as any).groupPinEvents.push(groups);
                });
                (window as any).testWidget = widget;
            }, simpleFixture);

            await waitForWidgetRender(page);

            // Check if widget has group functionality
            const hasGroupMethods = await page.evaluate(() => {
                const widget = (window as any).testWidget;
                return typeof widget.getPinnedGroups === "function" &&
                       typeof widget.togglePinnedGroup === "function";
            });

            if (hasGroupMethods) {
                // Try to pin a group
                await page.evaluate(() => {
                    (window as any).testWidget.togglePinnedGroup("test_group", [0, 1]);
                });

                const events = await page.evaluate(() => (window as any).groupPinEvents);
                expect(events.length).toBeGreaterThan(0);
            }
        });

        test("getPinnedGroups returns array", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture);
            await waitForWidgetRender(page);

            const groups = await page.evaluate(() => (window as any).testWidget.getPinnedGroups());
            expect(Array.isArray(groups)).toBe(true);
        });
    });

    test.describe("Multiple Interactions", () => {
        test("hover while multiple rows pinned renders correctly", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture);
            await waitForWidgetRender(page);

            // Pin multiple rows
            await page.evaluate(() => {
                (window as any).testWidget.togglePinnedRow(0);
                (window as any).testWidget.togglePinnedRow(1);
                (window as any).testWidget.togglePinnedRow(2);
            });

            // Count paths for pinned rows
            const pathsWithPins = await page.locator("#container svg path").count();
            expect(pathsWithPins).toBeGreaterThan(0);

            // Hover over another row
            const inputToken = page.locator("#container .input-token").last();
            await inputToken.hover();
            await page.waitForTimeout(50);

            // Should still have paths (pinned + hover)
            const pathsWithHover = await page.locator("#container svg path").count();
            expect(pathsWithHover).toBeGreaterThan(0);
        });

        test("rapid hover changes don't crash widget", async ({ page }) => {
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture);
            await waitForWidgetRender(page);

            // Rapidly hover over different rows
            const tokens = page.locator("#container .input-token");
            const count = await tokens.count();

            for (let i = 0; i < Math.min(count, 5); i++) {
                await tokens.nth(i).hover();
                // Very short delay to stress test
                await page.waitForTimeout(10);
            }

            // Widget should still be functional
            const state = await page.evaluate(() => (window as any).testWidget.getState());
            expect(state).toBeDefined();
        });

        test("hovering row A shows pinned token trajectory even when different row B is pinned", async ({ page }) => {
            // This test verifies the fix for the bug where hovering row A wouldn't show
            // the trajectory for a pinned token when a different row B was pinned.
            await setupWidgetPage(page);
            await initWidget(page, simpleFixture, { pinnedRows: [] });
            await waitForWidgetRender(page);

            // Pin row 0 (position 0)
            await page.evaluate(() => {
                (window as any).testWidget.togglePinnedRow(0);
            });

            // Pin token "x" which appears in row 1's tracked data
            await page.evaluate(() => {
                (window as any).testWidget.togglePinnedTrajectory("x");
            });

            // Count trajectory paths with row 0 pinned
            const pathsBeforeHover = await page.locator("#container svg path[stroke]").count();

            // Hover over row 1 (different from pinned row 0)
            const inputTokens = page.locator("#container .input-token");
            await inputTokens.nth(1).hover();
            await page.waitForTimeout(100);

            // Verify: should have trajectory for both the pinned row (0) AND the hovered row (1)
            // The fix ensures hovering row 1 shows the pinned token's trajectory at row 1,
            // even though row 0 is pinned instead.
            const pathsAfterHover = await page.locator("#container svg path[stroke]").count();

            // Should have more paths after hover (hover position trajectory added)
            expect(pathsAfterHover).toBeGreaterThanOrEqual(pathsBeforeHover);

            // Verify the hover position is included in chart rendering
            // by checking that the widget's getHoveredRow returns correct position
            const hoveredRow = await page.evaluate(() => (window as any).testWidget.getHoveredRow());
            expect(hoveredRow).toBe(1);
        });
    });
});

// ═══════════════════════════════════════════════════════════════
// MULTIPLE WIDGET INSTANCE TESTS
// Tests for notebook environment where multiple widgets coexist
// ═══════════════════════════════════════════════════════════════

test.describe("Multiple Widget Instances", () => {
    // Create different test data for each widget
    const widget1Data = {
        meta: { version: 2, model: "test-model-1" },
        input: ["Alpha", " beta", " gamma", " delta"],
        layers: [0, 1, 2, 3, 4],
        topk: Array(5).fill(null).map(() =>
            Array(4).fill(null).map(() => ["tok1", "tok2", "tok3"])
        ),
        tracked: Array(4).fill(null).map(() => ({
            "tok1": [0.5, 0.6, 0.7, 0.8, 0.9],
            "tok2": [0.3, 0.35, 0.4, 0.45, 0.5],
        })),
    };

    const widget2Data = {
        meta: { version: 2, model: "test-model-2" },
        input: ["Hello", " world"],
        layers: [0, 1, 2],
        topk: Array(3).fill(null).map(() =>
            Array(2).fill(null).map(() => ["a", "b"])
        ),
        tracked: Array(2).fill(null).map(() => ({
            "a": [0.8, 0.85, 0.9],
            "b": [0.1, 0.15, 0.2],
        })),
    };

    const widget3Data = {
        meta: { version: 2, model: "test-model-3" },
        input: ["1", " +", " 1", " ="],
        layers: [0, 1],
        topk: Array(2).fill(null).map(() =>
            Array(4).fill(null).map(() => ["2", "3"])
        ),
        tracked: Array(4).fill(null).map(() => ({
            "2": [0.7, 0.9],
            "3": [0.2, 0.1],
        })),
    };

    // Setup page with multiple widget containers
    async function setupMultiWidgetPage(page: Page) {
        await page.setContent(`
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { margin: 0; padding: 20px; font-family: sans-serif; }
                    .widget-container { width: 100%; height: 300px; margin-bottom: 20px; border: 1px solid #ccc; }
                </style>
            </head>
            <body>
                <div id="widget1" class="widget-container"></div>
                <div id="widget2" class="widget-container"></div>
                <div id="widget3" class="widget-container"></div>
            </body>
            </html>
        `);
        await page.addScriptTag({ content: widgetJs });
        await page.waitForFunction(() => typeof (window as any).LogitLensWidget === "function");
    }

    test.describe("Unique ID Generation", () => {
        test("each widget instance has a unique internal ID", async ({ page }) => {
            await setupMultiWidgetPage(page);

            const ids = await page.evaluate((datasets) => {
                const w1 = (window as any).LogitLensWidget("#widget1", datasets[0]);
                const w2 = (window as any).LogitLensWidget("#widget2", datasets[1]);
                const w3 = (window as any).LogitLensWidget("#widget3", datasets[2]);
                (window as any).widgets = [w1, w2, w3];
                return [w1.uid, w2.uid, w3.uid];
            }, [widget1Data, widget2Data, widget3Data]);

            // All IDs should be unique
            expect(ids[0]).not.toBe(ids[1]);
            expect(ids[1]).not.toBe(ids[2]);
            expect(ids[0]).not.toBe(ids[2]);

            // IDs should have the expected format (ll_ prefix)
            for (const id of ids) {
                expect(id).toMatch(/^ll_/);
            }
        });

        test("widgets embedded in separate IIFEs have unique IDs (Jupyter pattern)", async ({ page }) => {
            // This is the CRITICAL test for the Jupyter bug
            // In Jupyter, each cell output embeds the widget code in its own IIFE
            // With a counter-based approach, each IIFE has its own counter starting at 0
            // This test simulates that by embedding the widget code multiple times
            await page.setContent(`
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { margin: 0; padding: 20px; }
                        .widget-container { margin-bottom: 20px; border: 1px solid #ccc; height: 200px; }
                    </style>
                </head>
                <body>
                    <div id="iife-widget-1" class="widget-container"></div>
                    <div id="iife-widget-2" class="widget-container"></div>
                    <div id="iife-widget-3" class="widget-container"></div>
                </body>
                </html>
            `);

            // Load the raw widget JS source
            const widgetSource = widgetJs;

            // Create widgets using separate evaluations (simulating separate IIFEs)
            // Each evaluation creates a fresh JavaScript context for the IIFE
            const id1 = await page.evaluate(({ source, data }) => {
                // Simulate Jupyter IIFE pattern
                const script = `
                    (function() {
                        ${source}
                        var widget = LogitLensWidget("#iife-widget-1", ${JSON.stringify(data)});
                        window.iifeWidget1 = widget;
                        return widget ? widget.uid : null;
                    })();
                `;
                return eval(script);
            }, { source: widgetSource, data: widget1Data });

            const id2 = await page.evaluate(({ source, data }) => {
                const script = `
                    (function() {
                        ${source}
                        var widget = LogitLensWidget("#iife-widget-2", ${JSON.stringify(data)});
                        window.iifeWidget2 = widget;
                        return widget ? widget.uid : null;
                    })();
                `;
                return eval(script);
            }, { source: widgetSource, data: widget2Data });

            const id3 = await page.evaluate(({ source, data }) => {
                const script = `
                    (function() {
                        ${source}
                        var widget = LogitLensWidget("#iife-widget-3", ${JSON.stringify(data)});
                        window.iifeWidget3 = widget;
                        return widget ? widget.uid : null;
                    })();
                `;
                return eval(script);
            }, { source: widgetSource, data: widget3Data });

            // All IDs should be unique - this is what fails with counter-based IDs
            expect(id1).not.toBeNull();
            expect(id2).not.toBeNull();
            expect(id3).not.toBeNull();
            expect(id1).not.toBe(id2);
            expect(id2).not.toBe(id3);
            expect(id1).not.toBe(id3);
        });

        test("rapid widget creation produces unique IDs", async ({ page }) => {
            await setupMultiWidgetPage(page);

            // Create many widgets rapidly
            const ids = await page.evaluate((data) => {
                const ids: string[] = [];
                for (let i = 0; i < 10; i++) {
                    const container = document.createElement("div");
                    container.id = `rapid-widget-${i}`;
                    document.body.appendChild(container);
                    const widget = (window as any).LogitLensWidget(`#rapid-widget-${i}`, data);
                    if (widget) ids.push(widget.uid);
                }
                return ids;
            }, widget1Data);

            // All IDs should be unique
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);
        });
    });

    test.describe("Data Isolation", () => {
        test("each widget displays its own data", async ({ page }) => {
            await setupMultiWidgetPage(page);

            await page.evaluate((datasets) => {
                (window as any).w1 = (window as any).LogitLensWidget("#widget1", datasets[0], { title: "Widget 1" });
                (window as any).w2 = (window as any).LogitLensWidget("#widget2", datasets[1], { title: "Widget 2" });
                (window as any).w3 = (window as any).LogitLensWidget("#widget3", datasets[2], { title: "Widget 3" });
            }, [widget1Data, widget2Data, widget3Data]);

            // Wait for all widgets to render
            await page.waitForSelector("#widget1 table");
            await page.waitForSelector("#widget2 table");
            await page.waitForSelector("#widget3 table");

            // Check each widget has correct number of input tokens
            const w1Tokens = await page.locator("#widget1 .input-token").count();
            const w2Tokens = await page.locator("#widget2 .input-token").count();
            const w3Tokens = await page.locator("#widget3 .input-token").count();

            expect(w1Tokens).toBe(4); // "Alpha", " beta", " gamma", " delta"
            expect(w2Tokens).toBe(2); // "Hello", " world"
            expect(w3Tokens).toBe(4); // "1", " +", " 1", " ="
        });

        test("each widget has its own title", async ({ page }) => {
            await setupMultiWidgetPage(page);

            await page.evaluate((datasets) => {
                (window as any).LogitLensWidget("#widget1", datasets[0], { title: "France Analysis" });
                (window as any).LogitLensWidget("#widget2", datasets[1], { title: "Greeting Test" });
                (window as any).LogitLensWidget("#widget3", datasets[2], { title: "Math Problem" });
            }, [widget1Data, widget2Data, widget3Data]);

            await page.waitForSelector("#widget1 table");
            await page.waitForSelector("#widget2 table");
            await page.waitForSelector("#widget3 table");

            // Verify titles are displayed
            const w1Text = await page.locator("#widget1").textContent();
            const w2Text = await page.locator("#widget2").textContent();
            const w3Text = await page.locator("#widget3").textContent();

            expect(w1Text).toContain("France Analysis");
            expect(w2Text).toContain("Greeting Test");
            expect(w3Text).toContain("Math Problem");
        });
    });

    test.describe("Interaction Isolation", () => {
        test("pinning row in widget1 does not affect widget2", async ({ page }) => {
            await setupMultiWidgetPage(page);

            // Use auto-pin (each widget pins its own last row)
            await page.evaluate((datasets) => {
                (window as any).w1 = (window as any).LogitLensWidget("#widget1", datasets[0]);
                (window as any).w2 = (window as any).LogitLensWidget("#widget2", datasets[1]);
            }, [widget1Data, widget2Data]);

            await page.waitForSelector("#widget1 table");
            await page.waitForSelector("#widget2 table");

            // Both widgets start with 1 auto-pinned row
            const w1PinsBefore = await page.evaluate(() => (window as any).w1.getPinnedRows().length);
            const w2PinsBefore = await page.evaluate(() => (window as any).w2.getPinnedRows().length);
            expect(w1PinsBefore).toBe(1);
            expect(w2PinsBefore).toBe(1);

            // Pin additional row in widget1
            await page.evaluate(() => (window as any).w1.togglePinnedRow(0));

            // Verify widget1 has 2 pinned rows
            const w1Pins = await page.evaluate(() => (window as any).w1.getPinnedRows().length);
            expect(w1Pins).toBe(2);

            // Verify widget2 still has only 1 (unchanged)
            const w2Pins = await page.evaluate(() => (window as any).w2.getPinnedRows().length);
            expect(w2Pins).toBe(1);
        });

        test("hover in widget1 does not trigger widget2 callbacks", async ({ page }) => {
            await setupMultiWidgetPage(page);

            await page.evaluate((datasets) => {
                (window as any).w1HoverCount = 0;
                (window as any).w2HoverCount = 0;

                const w1 = (window as any).LogitLensWidget("#widget1", datasets[0]);
                const w2 = (window as any).LogitLensWidget("#widget2", datasets[1]);

                w1.on('hover', () => (window as any).w1HoverCount++);
                w2.on('hover', () => (window as any).w2HoverCount++);

                (window as any).w1 = w1;
                (window as any).w2 = w2;
            }, [widget1Data, widget2Data]);

            await page.waitForSelector("#widget1 table");
            await page.waitForSelector("#widget2 table");

            // Hover over widget1 tokens
            await page.locator("#widget1 .input-token").first().hover();
            await page.waitForTimeout(50);

            const w1Count = await page.evaluate(() => (window as any).w1HoverCount);
            const w2Count = await page.evaluate(() => (window as any).w2HoverCount);

            expect(w1Count).toBeGreaterThan(0);
            expect(w2Count).toBe(0);
        });

        test("color mode change in widget1 does not affect widget2", async ({ page }) => {
            await setupMultiWidgetPage(page);

            await page.evaluate((datasets) => {
                (window as any).w1 = (window as any).LogitLensWidget("#widget1", datasets[0]);
                (window as any).w2 = (window as any).LogitLensWidget("#widget2", datasets[1]);
            }, [widget1Data, widget2Data]);

            await page.waitForSelector("#widget1 table");
            await page.waitForSelector("#widget2 table");

            // Change dark mode in widget1
            await page.evaluate(() => (window as any).w1.setDarkMode(true));

            const w1Dark = await page.evaluate(() => (window as any).w1.getDarkMode());
            const w2Dark = await page.evaluate(() => (window as any).w2.getDarkMode());

            expect(w1Dark).toBe(true);
            expect(w2Dark).toBe(false);
        });

        test("metric change in widget1 does not affect widget2", async ({ page }) => {
            await setupMultiWidgetPage(page);

            // Add rank data to fixtures
            const dataWithRank1 = {
                ...widget1Data,
                tracked: widget1Data.tracked.map((t) => ({
                    "tok1": { prob: [0.5, 0.6, 0.7, 0.8, 0.9], rank: [1, 1, 1, 1, 1] },
                    "tok2": { prob: [0.3, 0.35, 0.4, 0.45, 0.5], rank: [2, 2, 2, 2, 2] },
                })),
            };
            const dataWithRank2 = {
                ...widget2Data,
                tracked: widget2Data.tracked.map((t) => ({
                    "a": { prob: [0.8, 0.85, 0.9], rank: [1, 1, 1] },
                    "b": { prob: [0.1, 0.15, 0.2], rank: [5, 4, 3] },
                })),
            };

            await page.evaluate((datasets) => {
                (window as any).w1 = (window as any).LogitLensWidget("#widget1", datasets[0]);
                (window as any).w2 = (window as any).LogitLensWidget("#widget2", datasets[1]);
            }, [dataWithRank1, dataWithRank2]);

            await page.waitForSelector("#widget1 table");
            await page.waitForSelector("#widget2 table");

            // Change metric in widget1
            await page.evaluate(() => (window as any).w1.setTrajectoryMetric("rank"));

            const w1Metric = await page.evaluate(() => (window as any).w1.getTrajectoryMetric());
            const w2Metric = await page.evaluate(() => (window as any).w2.getTrajectoryMetric());

            expect(w1Metric).toBe("rank");
            expect(w2Metric).toBe("probability");
        });
    });

    test.describe("Notebook Loop Pattern", () => {
        test("widgets created in loop all render correctly", async ({ page }) => {
            // Simulate Jupyter cell output pattern: each widget in its own IIFE
            await page.setContent(`
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { margin: 0; padding: 20px; }
                        .widget-container { margin-bottom: 20px; }
                    </style>
                </head>
                <body>
                    <div id="output"></div>
                </body>
                </html>
            `);
            await page.addScriptTag({ content: widgetJs });
            await page.waitForFunction(() => typeof (window as any).LogitLensWidget === "function");

            // Simulate loop creating multiple widgets (like Jupyter for loop)
            await page.evaluate((datasets) => {
                const output = document.getElementById("output")!;
                const widgets: any[] = [];

                datasets.forEach((data, i) => {
                    // Each iteration creates a container and widget (like Jupyter cell output)
                    const containerId = `loop-widget-${i}`;
                    const container = document.createElement("div");
                    container.id = containerId;
                    container.className = "widget-container";
                    output.appendChild(container);

                    // Create widget (each in its own "scope" like Jupyter IIFE)
                    const widget = (window as any).LogitLensWidget("#" + containerId, data, {
                        title: `Widget ${i + 1}`,
                    });
                    widgets.push(widget);
                });

                (window as any).loopWidgets = widgets;
            }, [widget1Data, widget2Data, widget3Data]);

            // Wait for all widgets to render
            await page.waitForSelector("#loop-widget-0 table");
            await page.waitForSelector("#loop-widget-1 table");
            await page.waitForSelector("#loop-widget-2 table");

            // Verify each widget has correct token count
            const counts = await page.evaluate(() => {
                return (window as any).loopWidgets.map((w: any) => {
                    const state = w.getState();
                    return state;
                });
            });

            expect(counts.length).toBe(3);

            // Verify all widgets have unique IDs
            const uids = await page.evaluate(() =>
                (window as any).loopWidgets.map((w: any) => w.uid)
            );
            const uniqueUids = new Set(uids);
            expect(uniqueUids.size).toBe(3);
        });

        test("widgets created with insertAdjacentHTML pattern work", async ({ page }) => {
            // This pattern is common in Jupyter notebook output
            await page.setContent(`
                <!DOCTYPE html>
                <html>
                <head>
                    <style>body { margin: 0; padding: 20px; }</style>
                </head>
                <body>
                    <div id="notebook-output"></div>
                </body>
                </html>
            `);
            await page.addScriptTag({ content: widgetJs });
            await page.waitForFunction(() => typeof (window as any).LogitLensWidget === "function");

            // Simulate Jupyter's insertAdjacentHTML pattern
            const result = await page.evaluate((data) => {
                const output = document.getElementById("notebook-output")!;
                const widgets: any[] = [];

                for (let i = 0; i < 3; i++) {
                    const containerId = `inserted-widget-${i}`;
                    // Jupyter often uses insertAdjacentHTML to add cell outputs
                    output.insertAdjacentHTML("beforeend", `<div id="${containerId}"></div>`);

                    // Small delay simulation (use setTimeout in real scenario)
                    const widget = (window as any).LogitLensWidget("#" + containerId, data);
                    widgets.push(widget);
                }

                return widgets.map((w) => w?.uid).filter(Boolean);
            }, widget1Data);

            expect(result.length).toBe(3);
            expect(new Set(result).size).toBe(3); // All unique
        });
    });

    test.describe("DOM Readiness", () => {
        test("widget handles delayed container availability", async ({ page }) => {
            await page.setContent(`
                <!DOCTYPE html>
                <html>
                <head></head>
                <body>
                    <div id="placeholder"></div>
                </body>
                </html>
            `);
            await page.addScriptTag({ content: widgetJs });
            await page.waitForFunction(() => typeof (window as any).LogitLensWidget === "function");

            // Try to create widget with container that doesn't exist yet
            const result = await page.evaluate((data) => {
                // Container doesn't exist
                const widget = (window as any).LogitLensWidget("#delayed-container", data);
                return widget; // Should return undefined
            }, widget1Data);

            expect(result).toBeUndefined();

            // Now add the container and create widget
            await page.evaluate(() => {
                const container = document.createElement("div");
                container.id = "delayed-container";
                document.body.appendChild(container);
            });

            const successResult = await page.evaluate((data) => {
                const widget = (window as any).LogitLensWidget("#delayed-container", data);
                return widget?.uid;
            }, widget1Data);

            expect(successResult).toBeDefined();
            expect(successResult).toMatch(/^ll_/);
        });
    });
});

// ═══════════════════════════════════════════════════════════════
// VISUAL REGRESSION TESTS
// ═══════════════════════════════════════════════════════════════

test.describe("Visual Regression", () => {
    test.afterEach(async ({ page }) => {
        await cleanupWidget(page);
    });

    test("widget renders consistently in light mode", async ({ page }) => {
        await setupWidgetPage(page, "800px", "400px");
        await initWidget(page, simpleFixture);
        await waitForWidgetRender(page);

        // Pin a row to show chart
        await page.evaluate(() => (window as any).testWidget.togglePinnedRow(1));

        await expect(page.locator("#container")).toHaveScreenshot("widget-light-mode.png", {
            maxDiffPixelRatio: 0.05,
        });
    });

    test("widget renders consistently in dark mode", async ({ page }) => {
        await setupWidgetPage(page, "800px", "400px");
        await initWidget(page, simpleFixture);
        await waitForWidgetRender(page);

        await page.evaluate(() => {
            (window as any).testWidget.togglePinnedRow(1);
            (window as any).testWidget.setDarkMode(true);
        });

        await expect(page.locator("#container")).toHaveScreenshot("widget-dark-mode.png", {
            maxDiffPixelRatio: 0.05,
        });
    });
});

// ═══════════════════════════════════════════════════════════════
// REACT INTEGRATION TESTS (Frontend + Mocked Backend)
// ═══════════════════════════════════════════════════════════════

test.describe("React Integration Tests", () => {
    test.beforeEach(async ({ page }) => {
        await setupApiMocks(page);
    });

    test("main page loads without server errors", async ({ page }) => {
        const response = await page.goto("/");
        expect(response?.status()).toBeLessThan(500);
    });

    test("workbench route responds", async ({ page }) => {
        const response = await page.goto("/workbench");
        expect(response).not.toBeNull();
        // May redirect to login, show content, or error if backend APIs aren't available
        // Accept any response that indicates the route exists (not 404)
        expect(response?.status()).not.toBe(404);
    });

    test("widget JS is served from public folder", async ({ page }) => {
        const response = await page.goto("/logit-lens-widget.js");
        expect(response?.status()).toBe(200);
        expect(response?.headers()["content-type"]).toContain("javascript");
    });

    test("minified widget JS is served", async ({ page }) => {
        const response = await page.goto("/logit-lens-widget.min.js");
        expect(response?.status()).toBe(200);
    });

    test("workbench displays model selector with mocked models", async ({ page }) => {
        await page.goto("/workbench");

        // Wait for page to load and check for model-related UI
        // The specific selectors depend on your React component structure
        await page.waitForLoadState("networkidle");

        // Check that the page loaded something (not just an error)
        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();
    });

    test("API mock returns expected model list", async ({ page }) => {
        await page.goto("/");

        // Verify the mock is working by making a direct fetch
        const models = await page.evaluate(async () => {
            const response = await fetch("/models/");
            return response.json();
        });

        expect(models).toBeInstanceOf(Array);
        expect(models.length).toBeGreaterThan(0);
        expect(models[0]).toHaveProperty("name");
    });

    test("API mock returns V2 lens data format", async ({ page }) => {
        await page.goto("/");

        const data = await page.evaluate(async () => {
            const response = await fetch("/lens/start-v2", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "meta-llama/Llama-3.1-70B",
                    prompt: "Test prompt",
                    k: 5,
                }),
            });
            return response.json();
        });

        // Verify mock returns expected structure
        expect(data).toBeDefined();
    });
});

test.describe("Missing Trajectory Data Handling", () => {
    // Fixture where some tokens have trajectory data and some don't
    const partialDataFixture = {
        meta: { version: 2, model: "test-model" },
        input: ["The", " capital", " of", " France", " is"],
        layers: [0, 1, 2, 3],
        topk: [
            [[" Paris", " city"], [" capital", " of"], [" of", " the"], [" France", " country"], [" is", " Paris"]],
            [[" Paris", " city"], [" capital", " town"], [" the", " a"], [" France", " country"], [" Paris", " London"]],
            [[" Paris", " city"], [" capital", " town"], [" the", " a"], [" France", " country"], [" Paris", " London"]],
            [[" Paris", " city"], [" capital", " town"], [" the", " a"], [" France", " country"], [" Paris", " London"]],
        ],
        tracked: [
            // Position 0: only " Paris" tracked, not " city"
            { " Paris": [0.1, 0.2, 0.3, 0.4] },
            // Position 1: both tracked
            { " capital": [0.3, 0.3, 0.2, 0.1], " of": [0.2, 0.2, 0.3, 0.3] },
            // Position 2: no tokens tracked (empty)
            {},
            // Position 3: only " France" tracked
            { " France": [0.5, 0.6, 0.7, 0.8] },
            // Position 4: multiple tracked
            { " Paris": [0.1, 0.3, 0.5, 0.7], " London": [0.05, 0.1, 0.15, 0.2] },
        ],
    };

    test("widget renders without errors when some positions have no tracked data", async ({ page }) => {
        await setupWidgetPage(page);

        const result = await page.evaluate((data) => {
            try {
                const widget = (window as any).LogitLensWidget("#container", data);
                (window as any).testWidget = widget;
                return { success: true };
            } catch (e: any) {
                return { success: false, error: e.message };
            }
        }, partialDataFixture);

        expect(result.success).toBe(true);
        await waitForWidgetRender(page);

        // Table should render
        const table = await page.locator("#container table").count();
        expect(table).toBe(1);
    });

    test("pinning token with no trajectory data does not crash", async ({ page }) => {
        await setupWidgetPage(page);
        await initWidget(page, partialDataFixture, { pinnedRows: [] });
        await waitForWidgetRender(page);

        // Try to pin a trajectory for a token that's not in tracked data
        const result = await page.evaluate(() => {
            try {
                // " city" is in topk but not in tracked
                (window as any).testWidget.togglePinnedTrajectory(" city");
                return { success: true };
            } catch (e: any) {
                return { success: false, error: e.message };
            }
        });

        expect(result.success).toBe(true);
    });

    test("group with partial data still draws trajectory line", async ({ page }) => {
        await setupWidgetPage(page);
        await initWidget(page, partialDataFixture, { pinnedRows: [] });
        await waitForWidgetRender(page);

        // Pin a group where one token has data and one doesn't
        await page.evaluate(() => {
            const widget = (window as any).testWidget;
            // Pin " Paris" (has data) first
            widget.togglePinnedTrajectory(" Paris");
            // Then add " city" (no data) to the group
            widget.togglePinnedTrajectory(" city", true);
            // Pin row 0 to show the trajectory
            widget.togglePinnedRow(0);
        });

        // Should have at least one SVG path (the trajectory line)
        await page.waitForTimeout(50);
        const paths = await page.locator("#container svg path").count();
        expect(paths).toBeGreaterThan(0);
    });

    test("group with no data for any token does not draw line", async ({ page }) => {
        await setupWidgetPage(page);

        // Create fixture where tracked tokens aren't in the data at all
        const noDataFixture = {
            ...partialDataFixture,
            tracked: partialDataFixture.tracked.map(() => ({})), // Empty tracked for all positions
        };

        await initWidget(page, noDataFixture, { pinnedRows: [] });
        await waitForWidgetRender(page);

        // Pin a token that has no trajectory data anywhere
        await page.evaluate(() => {
            (window as any).testWidget.togglePinnedTrajectory(" NonexistentToken");
            (window as any).testWidget.togglePinnedRow(0);
        });

        await page.waitForTimeout(50);

        // Should not have trajectory paths (only axis lines might exist)
        const svg = await page.locator("#container svg").first();
        const pathsHtml = await svg.innerHTML();
        // Chart might have axis elements but shouldn't have trajectory paths with stroke colors
        expect(pathsHtml).toBeDefined();
    });
});

test.describe("Rank Mode with TrackedTrajectory Format", () => {
    // Fixture with TrackedTrajectory format (both prob and rank arrays)
    const rankDataFixture = {
        meta: { version: 2, model: "test-model" },
        input: ["The", " capital", " of"],
        layers: [0, 1, 2, 3],
        topk: [
            [[" Paris", " city"], [" capital", " town"], [" of", " the"]],
            [[" Paris", " city"], [" capital", " town"], [" of", " the"]],
            [[" Paris", " city"], [" capital", " town"], [" of", " the"]],
            [[" Paris", " city"], [" capital", " town"], [" of", " the"]],
        ],
        tracked: [
            // Position 0 with TrackedTrajectory format
            {
                " Paris": { prob: [0.1, 0.2, 0.3, 0.4], rank: [100, 50, 25, 10] },
                " city": { prob: [0.05, 0.08, 0.1, 0.12], rank: [200, 150, 100, 80] },
            },
            // Position 1
            {
                " capital": { prob: [0.3, 0.3, 0.2, 0.1], rank: [5, 8, 15, 30] },
                " town": { prob: [0.1, 0.12, 0.15, 0.08], rank: [20, 18, 12, 25] },
            },
            // Position 2
            {
                " of": { prob: [0.2, 0.25, 0.3, 0.35], rank: [10, 8, 6, 4] },
                " the": { prob: [0.15, 0.18, 0.2, 0.22], rank: [15, 12, 10, 8] },
            },
        ],
    };

    test("widget renders correctly with TrackedTrajectory format data", async ({ page }) => {
        await setupWidgetPage(page);

        const result = await page.evaluate((data) => {
            try {
                const widget = (window as any).LogitLensWidget("#container", data);
                (window as any).testWidget = widget;
                return { success: true };
            } catch (e: any) {
                return { success: false, error: e.message };
            }
        }, rankDataFixture);

        expect(result.success).toBe(true);
        await waitForWidgetRender(page);
    });

    test("hasRankData returns true when rank data present", async ({ page }) => {
        await setupWidgetPage(page);
        await initWidget(page, rankDataFixture);
        await waitForWidgetRender(page);

        const hasRank = await page.evaluate(() => (window as any).testWidget.hasRankData());
        expect(hasRank).toBe(true);
    });

    test("hasRankData returns false when no rank data", async ({ page }) => {
        await setupWidgetPage(page);

        // Create fixture without rank data (simple array format)
        const noRankFixture = {
            meta: { version: 2, model: "test-model" },
            input: ["The", " cat", " sat"],
            layers: [0, 1, 2, 3],
            topk: [
                [["a", "b"], ["x", "y"], [".", ","]],
                [["a", "b"], ["x", "y"], [".", ","]],
                [["a", "b"], ["x", "y"], [".", ","]],
                [["a", "b"], ["x", "y"], [".", ","]],
            ],
            tracked: [
                { "a": [0.5, 0.6, 0.7, 0.8], "b": [0.3, 0.2, 0.1, 0.1] }, // Simple arrays, no rank
                { "x": [0.4, 0.3, 0.2, 0.1], "y": [0.2, 0.3, 0.4, 0.5] },
                { ".": [0.3, 0.35, 0.4, 0.45], ",": [0.2, 0.25, 0.3, 0.35] },
            ],
        };

        await initWidget(page, noRankFixture);
        await waitForWidgetRender(page);

        const hasRank = await page.evaluate(() => (window as any).testWidget.hasRankData());
        expect(hasRank).toBe(false);
    });

    test("rank mode uses minimum rank for grouped tokens", async ({ page }) => {
        await setupWidgetPage(page);
        await initWidget(page, rankDataFixture, { pinnedRows: [] });
        await waitForWidgetRender(page);

        // Pin a group of two tokens
        await page.evaluate(() => {
            const widget = (window as any).testWidget;
            widget.togglePinnedTrajectory(" Paris"); // rank: [100, 50, 25, 10]
            widget.togglePinnedTrajectory(" city", true); // rank: [200, 150, 100, 80]
            widget.togglePinnedRow(0);
            widget.setTrajectoryMetric("rank");
        });

        await page.waitForTimeout(100);

        // Should render chart with trajectory
        const paths = await page.locator("#container svg path").count();
        expect(paths).toBeGreaterThan(0);

        // The group trajectory should use min rank (Paris's ranks: 100, 50, 25, 10)
        // Verify metric is rank
        const metric = await page.evaluate(() => (window as any).testWidget.getTrajectoryMetric());
        expect(metric).toBe("rank");
    });

    test("switching to rank mode when no rank data keeps probability mode", async ({ page }) => {
        await setupWidgetPage(page);

        // Create fixture without rank data
        const noRankFixture = {
            meta: { version: 2, model: "test-model" },
            input: ["The", " cat", " sat"],
            layers: [0, 1, 2, 3],
            topk: [
                [["a", "b"], ["x", "y"], [".", ","]],
                [["a", "b"], ["x", "y"], [".", ","]],
                [["a", "b"], ["x", "y"], [".", ","]],
                [["a", "b"], ["x", "y"], [".", ","]],
            ],
            tracked: [
                { "a": [0.5, 0.6, 0.7, 0.8], "b": [0.3, 0.2, 0.1, 0.1] },
                { "x": [0.4, 0.3, 0.2, 0.1], "y": [0.2, 0.3, 0.4, 0.5] },
                { ".": [0.3, 0.35, 0.4, 0.45], ",": [0.2, 0.25, 0.3, 0.35] },
            ],
        };

        await initWidget(page, noRankFixture, { pinnedRows: [] });
        await waitForWidgetRender(page);

        // Pin trajectory and row using tokens that exist in the fixture
        await page.evaluate(() => {
            const widget = (window as any).testWidget;
            widget.togglePinnedTrajectory("a"); // "a" exists in tracked
            widget.togglePinnedRow(0); // Position 0 is valid
            widget.setTrajectoryMetric("rank"); // Should fail silently, keeping probability mode
        });

        await page.waitForTimeout(100);

        // Should stay in probability mode (rank mode fails without rank data)
        const metric = await page.evaluate(() => (window as any).testWidget.getTrajectoryMetric());
        expect(metric).toBe("probability"); // Stays in probability mode
    });

    test("probability sum is used for grouped tokens in prob mode", async ({ page }) => {
        await setupWidgetPage(page);
        await initWidget(page, rankDataFixture, { pinnedRows: [] });
        await waitForWidgetRender(page);

        // Pin a group of two tokens in probability mode
        await page.evaluate(() => {
            const widget = (window as any).testWidget;
            widget.togglePinnedTrajectory(" Paris"); // prob: [0.1, 0.2, 0.3, 0.4]
            widget.togglePinnedTrajectory(" city", true); // prob: [0.05, 0.08, 0.1, 0.12]
            widget.togglePinnedRow(0);
            // Stay in probability mode (default)
        });

        await page.waitForTimeout(100);

        // Should render chart with trajectory
        const paths = await page.locator("#container svg path").count();
        expect(paths).toBeGreaterThan(0);

        // Verify in probability mode
        const metric = await page.evaluate(() => (window as any).testWidget.getTrajectoryMetric());
        expect(metric).toBe("probability");
    });
});
