import {
    test,
    expect,
    argosScreenshot,
    gotoFreshBranchingWorkspace,
    REAL_NDIF_TIMEOUT_MS,
} from "./fixtures";

/**
 * Researcher-mode Branching Generations E2E. Hits POST /branching/generate
 * live against gpt2 — the synchronous-blocking handler polls NDIF internally.
 */

test.describe("Branching Generations (researcher mode)", () => {
    test.setTimeout(REAL_NDIF_TIMEOUT_MS * 4);

    test("create workspace, generate variations, drill down, export INIF", async ({
        workbenchPage: page,
    }) => {
        await gotoFreshBranchingWorkspace(page);

        // Empty state visible until first generation.
        await expect(page.getByTestId("branching-empty")).toBeVisible({ timeout: 15_000 });

        // Bring max_tokens down to keep live NDIF round-trip short. The test
        // accepts the default 3-sample seed from AutoWorkspaceCreator — a
        // shorter completion is faster but still validates the multi-panel
        // render path.
        const maxTokens = page.getByTestId("branching-max-tokens");
        await maxTokens.fill("8");

        // Replace prompt with something short.
        const prompt = page.getByTestId("branching-prompt");
        await prompt.fill("The capital of France is");

        await page.getByTestId("branching-generate-button").click();

        // Trajectory comparison + at least one panel appear once
        // /branching/generate returns. (Default seed = 3 samples.)
        await expect(page.getByTestId("trajectory-comparison")).toBeVisible({
            timeout: REAL_NDIF_TIMEOUT_MS,
        });
        await expect(page.getByTestId("trajectory-panel-0")).toBeVisible();

        await argosScreenshot(page, "branching-researcher-after-generate", {
            fullPage: false,
        });

        // Click any token → drill-down opens.
        await page.getByTestId("trajectory-token-0-0").click();
        await expect(page.getByTestId("branch-drill-down")).toBeVisible();
        await page.getByTestId("branch-drill-down-close").click();

        // Export INIF triggers a download.
        const downloadPromise = page.waitForEvent("download");
        await page.getByTestId("branching-export-inif").click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toContain("branching-");
        expect(download.suggestedFilename()).toContain(".inif.json");
    });
});
