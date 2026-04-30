import {
    test,
    expect,
    argosScreenshot,
    gotoFreshLensWorkspace,
    gotoFreshAPWorkspace,
    REAL_NDIF_TIMEOUT_MS,
} from "./fixtures";

const SRC_PROMPT = "The Eiffel Tower is in the city of";
const TGT_PROMPT = "The Colosseum is in the city of";

test.describe("Activation Patching (real NDIF)", () => {
    test.setTimeout(REAL_NDIF_TIMEOUT_MS * 5);

    test("create chart via sidebar and configure source / target prompts", async ({
        workbenchPage: page,
    }) => {
        await gotoFreshLensWorkspace(page);

        // The sidebar exposes an "Activation Patching" button — clicking it
        // creates an AP chart in the current workspace.
        const apButton = page.getByRole("button", { name: "Activation Patching" }).first();
        await expect(apButton).toBeVisible({ timeout: 15_000 });
        await apButton.click();

        await page.waitForURL(/\/activation-patching\//, { timeout: 30_000 });

        await expect(page.getByText("Source Prompt", { exact: true })).toBeVisible({
            timeout: 15_000,
        });
        await expect(page.getByText("Target Prompt", { exact: true })).toBeVisible();

        const srcTextarea = page.getByPlaceholder("Enter source prompt...");
        await srcTextarea.fill(SRC_PROMPT);
        await srcTextarea.blur();
        // Source tokenization is local (huggingface tokenizer) — should resolve fast.
        await page.waitForTimeout(800);

        const tgtTextarea = page.getByPlaceholder("Enter target prompt...");
        await tgtTextarea.fill(TGT_PROMPT);
        await tgtTextarea.blur();
        await page.waitForTimeout(800);

        await argosScreenshot(page, "activation-patching-controls", { fullPage: false });
    });

    test("run end-to-end with pre-filled params and view the patched chart", async ({
        workbenchPage: page,
    }) => {
        // Source position 4 = "Eiffel"-ish; target position 4 = "Colosseum"-ish.
        // The exact alignment doesn't matter for the test — we just need a
        // valid configuration so the auto-run kicks off a real NDIF job.
        await gotoFreshAPWorkspace(page, {
            srcPrompt: SRC_PROMPT,
            tgtPrompt: TGT_PROMPT,
            srcPos: [4],
            tgtPos: [4],
        });

        await expect(page.getByText("Source Prompt", { exact: true })).toBeVisible({
            timeout: 15_000,
        });

        // Wait for the auto-run to flip the Run button into its "Computing" state
        // and back. We assert the Run button becomes enabled and visible at the end.
        const runButton = page.getByRole("button", { name: /Run|Computing/ });
        await expect(runButton).toBeVisible({ timeout: 15_000 });

        // Real NDIF activation-patching runs poll a job until completion.
        // Wait for the chart container to render data — the `Export` button only
        // appears in the AP display once a chart exists.
        await expect(page.getByRole("button", { name: /Export/i })).toBeVisible({
            timeout: REAL_NDIF_TIMEOUT_MS * 2,
        });

        await argosScreenshot(page, "activation-patching-results", { fullPage: false });
    });
});
