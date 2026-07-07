import {
    test,
    expect,
    argosScreenshot,
    gotoFreshLensWorkspace,
    REAL_NDIF_TIMEOUT_MS,
} from "./fixtures";

const PROMPT = "The Eiffel Tower is in the city of";

/**
 * Chat tool against real NDIF. Covers the two model-touching flows:
 *   - typing a prompt in the chat composer and generating a continuation;
 *   - "spinning out" the Logit Lens prompt into the chat, generating, then
 *     capturing the result back into the lens prompt editor.
 */
test.describe("Chat tool (real NDIF)", () => {
    test.setTimeout(REAL_NDIF_TIMEOUT_MS * 4);

    test("compose a prompt and generate a continuation", async ({ workbenchPage: page }) => {
        await gotoFreshLensWorkspace(page);

        await page.getByTestId("chat-open-button").click();
        const panel = page.getByTestId("chat-panel");
        await expect(panel).toBeVisible();

        // Keep the turn short so the real job round-trips quickly.
        await panel.getByLabel(/Max new tokens/i).fill("8");
        await panel.getByPlaceholder(/Message the model/i).fill(PROMPT);
        await panel.getByRole("button", { name: /^Send$/ }).click();

        // The turn appears immediately as pending, then resolves.
        await expect(panel.getByText(PROMPT).first()).toBeVisible();
        await expect(panel.getByText(/Generating/i)).toHaveCount(0, {
            timeout: REAL_NDIF_TIMEOUT_MS,
        });

        // Once done the capture-back actions are enabled.
        await expect(panel.getByRole("button", { name: "Logit Lens" }).first()).toBeEnabled();

        await argosScreenshot(page, "chat-generation", { fullPage: false });
    });

    test("spin the lens prompt out to chat, then capture it back", async ({
        workbenchPage: page,
    }) => {
        await gotoFreshLensWorkspace(page);

        const textarea = page.getByPlaceholder(/Enter your prompt here/);
        await expect(textarea).toBeVisible({ timeout: 15_000 });
        await textarea.fill(PROMPT);

        // Spin out: opens chat and auto-generates a continuation.
        await page.getByRole("button", { name: /Spin out/i }).click();

        const panel = page.getByTestId("chat-panel");
        await expect(panel).toBeVisible();
        await expect(panel.getByText(PROMPT).first()).toBeVisible();
        await expect(panel.getByText(/Generating/i)).toHaveCount(0, {
            timeout: REAL_NDIF_TIMEOUT_MS,
        });

        // Capture the (now longer) generated text back into the lens editor.
        await panel.getByRole("button", { name: "Logit Lens" }).first().click();
        await expect(textarea).toBeVisible();
        // The captured text starts with the original prompt and is at least as
        // long (prompt + generated continuation).
        const value = await textarea.inputValue();
        expect(value.startsWith(PROMPT)).toBeTruthy();
        expect(value.length).toBeGreaterThanOrEqual(PROMPT.length);

        await argosScreenshot(page, "chat-spin-out", { fullPage: false });
    });
});
