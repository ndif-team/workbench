import { test as base, expect, Page } from "@playwright/test";
import { argosScreenshot } from "@argos-ci/playwright";

/** Mock all backend API calls so tests don't need a running API server. */
function mockBackendAPIs(page: Page) {
    const BACKEND = "http://localhost:8000";

    page.route(`${BACKEND}/models/`, (route) =>
        route.fulfill({
            json: [
                {
                    name: "gpt2",
                    is_chat: false,
                    n_layers: 12,
                    params: "124M",
                    gated: false,
                    allowed: true,
                },
            ],
        }),
    );

    page.route(`${BACKEND}/models/start-prediction`, (route) =>
        route.fulfill({
            json: {
                job_id: null,
                data: {
                    idx: 4,
                    ids: [262, 318, 373],
                    probs: [0.08, 0.05, 0.04],
                    texts: [" the", " is", " to"],
                },
            },
        }),
    );

    page.route(`${BACKEND}/lens/start-line`, (route) =>
        route.fulfill({
            json: {
                job_id: null,
                data: [
                    {
                        id: " the",
                        data: Array.from({ length: 12 }, (_, i) => ({
                            x: i,
                            y: Math.random() * 0.3,
                        })),
                    },
                    {
                        id: " is",
                        data: Array.from({ length: 12 }, (_, i) => ({
                            x: i,
                            y: Math.random() * 0.2,
                        })),
                    },
                ],
            },
        }),
    );

    page.route(`${BACKEND}/lens/start-grid`, (route) =>
        route.fulfill({
            json: {
                job_id: null,
                data: Array.from({ length: 12 }, (_, layer) => ({
                    id: `Layer ${layer}`,
                    data: Array.from({ length: 5 }, (_, tok) => ({
                        x: `tok_${tok}`,
                        y: Math.random(),
                        label: ["the", "cat", "sat", "on", "mat"][tok],
                    })),
                })),
            },
        }),
    );

    page.route(`${BACKEND}/logit_lens/start`, (route) =>
        route.fulfill({
            json: {
                job_id: null,
                data: {
                    tokens: ["The", " cat", " sat"],
                    layers: Array.from({ length: 12 }, (_, i) => i),
                    topk: Array.from({ length: 12 }, () =>
                        Array.from({ length: 3 }, () => ({
                            tokens: [" the", " cat", " sat", " on", " mat"],
                            probs: [0.3, 0.2, 0.15, 0.1, 0.05],
                        })),
                    ),
                    entropy: Array.from({ length: 12 }, () =>
                        Array.from({ length: 3 }, () => 2.5 + Math.random()),
                    ),
                },
            },
        }),
    );

    page.route(`${BACKEND}/activation_patching/start`, (route) =>
        route.fulfill({
            json: {
                job_id: null,
                data: {
                    lines: Array.from({ length: 3 }, () =>
                        Array.from({ length: 12 }, () => Math.random()),
                    ),
                    ranks: Array.from({ length: 3 }, () =>
                        Array.from({ length: 12 }, () => Math.floor(Math.random() * 100)),
                    ),
                    prob_diffs: Array.from({ length: 3 }, () =>
                        Array.from({ length: 12 }, () => (Math.random() - 0.5) * 0.2),
                    ),
                    tokenLabels: [" the", " cat", " sat"],
                },
            },
        }),
    );

    page.route("https://api.ndif.us/response/**", (route) =>
        route.fulfill({ json: { status: "COMPLETED" } }),
    );
}

export const test = base.extend<{ workbenchPage: Page }>({
    workbenchPage: async ({ page }, use) => {
        mockBackendAPIs(page);
        await use(page);
    },
});

/** Navigate to a fresh workspace with a lens chart. */
export async function gotoFreshLensWorkspace(page: Page) {
    await page.goto("/workbench?createNew=true");
    await page.waitForURL(/\/workbench\/[^/]+\/[^/]+/, { timeout: 20_000 });
}

/** Navigate to a fresh workspace with an activation patching chart. */
export async function gotoFreshAPWorkspace(
    page: Page,
    opts?: {
        srcPrompt?: string;
        tgtPrompt?: string;
        srcPos?: number[];
        tgtPos?: number[];
    },
) {
    const params = new URLSearchParams({
        createNew: "true",
        tool: "Activation Patching",
        srcPrompt: opts?.srcPrompt ?? "",
        tgtPrompt: opts?.tgtPrompt ?? "",
        srcPos: JSON.stringify(opts?.srcPos ?? []),
        tgtPos: JSON.stringify(opts?.tgtPos ?? []),
        tgtFreeze: JSON.stringify([]),
        model: "gpt2",
    });
    await page.goto(`/workbench?${params.toString()}`);
    await page.waitForURL(/\/activation-patching\//, { timeout: 20_000 });
}

export { expect, argosScreenshot };
