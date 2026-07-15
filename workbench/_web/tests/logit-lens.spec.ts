import {
    test,
    expect,
    argosScreenshot,
    gotoFreshLensWorkspace,
    REAL_NDIF_TIMEOUT_MS,
} from "./fixtures";
import { createTestUser, loginAsUser, type TestingUser } from "./TestingUtils";

const PROMPT = "The Eiffel Tower is in the city of";

// Fresh user per file (real auth); log in before each test so workspaces are
// created under a real identity.
let user: TestingUser;
test.beforeAll(async () => {
    user = await createTestUser();
});
test.beforeEach(async ({ page }) => {
    await loginAsUser(page, user);
});

/**
 * Lens2 UI primer (what these tests anchor on — see
 * src/app/workbench/[workspaceId]/lens2/[chartId]/components/Lens2*.tsx):
 *
 *   Controls panel:
 *     - <textarea placeholder="Enter your prompt here...">
 *     - "Top-K Predictions" Slider (1..10)
 *     - "Include Entropy" Checkbox
 *     - "Run Logit Lens" Button (turns into "Computing..." while running)
 *     - Submit shortcut is Cmd/Ctrl + Enter (plain Enter just inserts a newline)
 *
 *   Display panel (Lens2Display.tsx):
 *     - Empty state: "No visualization data"
 *     - Running state: "Computing logit lens visualization..."
 *     - Result: a nnsightful <LogitLensWidget /> (we don't poke inside it)
 *
 * "Run completed" = "No visualization data" empty-state text is gone AND
 * "Computing logit lens visualization..." is gone.
 */

async function runOnce(page: import("@playwright/test").Page) {
    // The Run button is gated behind a blur-driven tokenization step
    // (`tokensInSync`) that's awkward to trigger reliably from a test. Submit
    // via the documented Cmd/Ctrl+Enter shortcut instead — it calls handleSubmit
    // directly, which tokenizes and runs in one step regardless of the button's
    // enabled state. Fall back to clicking Run if the editor already collapsed
    // to the token view (in which case Run is enabled).
    const editor = page.getByPlaceholder(/Enter your prompt here/);
    if ((await editor.count()) > 0) {
        await editor.focus();
        await editor.press("ControlOrMeta+Enter");
    } else {
        await page.getByRole("button", { name: /Run Logit Lens/i }).click();
    }

    // The widget Empty-state copy is the most stable signal that no
    // result exists yet — wait for it to disappear (or never appear if a
    // previous run already populated the chart).
    await expect(page.getByText(/No visualization data/i)).toHaveCount(0, {
        timeout: REAL_NDIF_TIMEOUT_MS,
    });
    // And that we're not still computing.
    await expect(page.getByText(/Computing logit lens visualization/i)).toHaveCount(0, {
        timeout: REAL_NDIF_TIMEOUT_MS,
    });
}

test.describe("Logit Lens (real NDIF)", () => {
    // Real NDIF jobs can take a while to start, run, and round-trip results.
    test.setTimeout(REAL_NDIF_TIMEOUT_MS * 4);

    test("enter prompt and run, widget renders", async ({ workbenchPage: page }) => {
        await gotoFreshLensWorkspace(page);

        const textarea = page.getByPlaceholder(/Enter your prompt here/);
        await expect(textarea).toBeVisible({ timeout: 15_000 });
        await textarea.fill(PROMPT);

        await runOnce(page);

        await argosScreenshot(page, "logit-lens-default", { fullPage: false });
    });

    test("run with higher Top-K", async ({ workbenchPage: page }) => {
        await gotoFreshLensWorkspace(page);

        const textarea = page.getByPlaceholder(/Enter your prompt here/);
        await expect(textarea).toBeVisible({ timeout: 15_000 });
        await textarea.fill(PROMPT);

        // The slider's accessible role is "slider"; nudge it to its max
        // (the slider goes 1..10) by sending End. The current value is
        // mirrored next to the label, so we can sanity-check there.
        const slider = page.getByRole("slider").first();
        await slider.focus();
        await slider.press("End");
        await expect(page.getByText(/Top-K Predictions/i).locator("..")).toContainText("10");

        await runOnce(page);

        await argosScreenshot(page, "logit-lens-topk-10", { fullPage: false });
    });

    test("run with Include Entropy enabled", async ({ workbenchPage: page }) => {
        await gotoFreshLensWorkspace(page);

        const textarea = page.getByPlaceholder(/Enter your prompt here/);
        await expect(textarea).toBeVisible({ timeout: 15_000 });
        await textarea.fill(PROMPT);

        const entropy = page.getByRole("checkbox", { name: /Include Entropy/i });
        await entropy.check();
        await expect(entropy).toBeChecked();

        await runOnce(page);

        await argosScreenshot(page, "logit-lens-entropy", { fullPage: false });
    });
});
