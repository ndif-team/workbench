import { test, expect, Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { waitForModelsLoaded, gotoFreshLensWorkspace } from "./fixtures";

/**
 * Chat tool E2E that don't need NDIF — they exercise the cross-workbench chat
 * surface and the "send a captured prompt back into a tool" handoff purely on
 * the front end:
 *
 *   - The chat rail is collapsed (unobtrusive) by default and toggles open.
 *   - A completed chat message can be sent into the Logit Lens: its text lands
 *     in the lens prompt editor.
 *
 * The handoff test seeds a fixed lens2 chart (tests/seed-chat.cjs) and injects
 * a completed chat message into localStorage so no generation is required.
 */

const WS_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHART_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CHAT_URL = `/workbench/${WS_ID}/lens2/${CHART_ID}`;

const CAPTURED = "The capital of France is Paris";

function seedChatStorage(page: Page) {
    return page.addInitScript(
        ({ ws, captured }) => {
            localStorage.setItem(
                "workbench:chat",
                JSON.stringify({
                    state: {
                        open: true,
                        maxNewTokens: 20,
                        draftByWorkspace: {},
                        historyByWorkspace: {
                            [ws]: [
                                {
                                    id: "seed-msg-1",
                                    prompt: "The capital of France is",
                                    completion: captured,
                                    model: "openai-community/gpt2",
                                    maxNewTokens: 20,
                                    status: "done",
                                    createdAt: 1,
                                },
                            ],
                        },
                    },
                    version: 0,
                }),
            );
        },
        { ws: WS_ID, captured: CAPTURED },
    );
}

test.describe("Chat tool (no NDIF)", () => {
    test("rail is collapsed by default and toggles open", async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 720 });
        await gotoFreshLensWorkspace(page);

        // Unobtrusive when idle: only the slim open affordance is present.
        const openButton = page.getByTestId("chat-open-button");
        await expect(openButton).toBeVisible({ timeout: 15_000 });
        await expect(page.getByTestId("chat-panel")).toHaveCount(0);

        // Expands into the full panel with a composer.
        await openButton.click();
        const panel = page.getByTestId("chat-panel");
        await expect(panel).toBeVisible();
        await expect(panel.getByPlaceholder(/Message the model/i)).toBeVisible();

        // And collapses again.
        await panel.getByRole("button", { name: /Collapse chat/i }).click();
        await expect(page.getByTestId("chat-panel")).toHaveCount(0);
    });

    test("send a chat result into the Logit Lens fills the prompt editor", async ({ page }) => {
        // Seed the chart in the DB and the completed message in localStorage.
        execFileSync("node", ["tests/seed-chat.cjs"], { stdio: "inherit" });

        await page.setViewportSize({ width: 1280, height: 720 });
        await seedChatStorage(page);
        await page.goto(CHAT_URL);
        await waitForModelsLoaded(page);

        // The seeded (open) panel shows the completed message.
        const panel = page.getByTestId("chat-panel");
        await expect(panel).toBeVisible({ timeout: 15_000 });
        await expect(panel.getByText(CAPTURED)).toBeVisible();

        // Capture it back into the Logit Lens.
        await panel.getByRole("button", { name: "Logit Lens" }).click();

        // The lens prompt editor now holds the captured text.
        const textarea = page.getByPlaceholder(/Enter your prompt here/);
        await expect(textarea).toBeVisible({ timeout: 15_000 });
        await expect(textarea).toHaveValue(CAPTURED);
    });
});
