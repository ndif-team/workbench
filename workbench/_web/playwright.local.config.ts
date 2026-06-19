import { defineConfig, devices } from "@playwright/test";

// Minimal local config (no Argos reporter, which fails to resolve under this
// Node's ESM loader). Used to run the seeded cm-intro UI E2E without NDIF.
export default defineConfig({
    testDir: "./tests",
    fullyParallel: false,
    workers: 1,
    reporter: [["list"]],
    use: {
        baseURL: "http://localhost:3000",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        ignoreHTTPSErrors: true,
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    webServer: {
        // Node 18.19 here is too old for Next 15.5's config loader (`with`
        // import attributes); the Bun runtime runs it fine.
        command: "bun --bun node_modules/.bin/next start -p 3000",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120_000,
    },
});
