import { defineConfig, devices } from "@playwright/test";
import { createArgosReporterOptions } from "@argos-ci/playwright/reporter";

export default defineConfig({
    testDir: "./tests",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: [
        [process.env.CI ? "dot" : "list"],
        ["html"],
        [
            "@argos-ci/playwright/reporter",
            createArgosReporterOptions({ uploadToArgos: !!process.env.CI }),
        ],
    ],
    use: {
        baseURL: "http://localhost:3000",
        trace: "on-first-retry",
        screenshot: "only-on-failure",
        // The browser polls https://api.ndif.us directly. Some CI / dev
        // environments (cluster egress proxies with custom CA roots) present
        // a cert chain that bundled Playwright Chromium doesn't trust —
        // accept those so the real-NDIF poll loop can complete.
        ignoreHTTPSErrors: true,
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
    webServer: {
        command: "bun run start",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});
