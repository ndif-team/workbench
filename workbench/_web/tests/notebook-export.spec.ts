import {
    test,
    expect,
    argosScreenshot,
    gotoFreshAPWorkspace,
    REAL_NDIF_TIMEOUT_MS,
} from "./fixtures";
import { createTestUser, loginAsUser, type TestingUser } from "./TestingUtils";

const SRC_PROMPT = "The Eiffel Tower is in the city of";
const TGT_PROMPT = "The Colosseum is in the city of";

// Fresh user per file (real auth); log in before each test.
let user: TestingUser;
test.beforeAll(async () => {
    user = await createTestUser();
});
test.beforeEach(async ({ page }) => {
    await loginAsUser(page, user);
});

test.describe("Notebook export (real NDIF)", () => {
    test.setTimeout(REAL_NDIF_TIMEOUT_MS * 5);

    test("export an activation patching chart to .ipynb", async ({ workbenchPage: page }) => {
        await gotoFreshAPWorkspace(page, {
            srcPrompt: SRC_PROMPT,
            tgtPrompt: TGT_PROMPT,
            srcPos: [4],
            tgtPos: [4],
        });

        // Wait for the AP chart to finish rendering — the Export button
        // is only mounted in the chart display once `patchingChart` exists.
        const exportButton = page.getByRole("button", { name: /Export/i });
        await expect(exportButton).toBeVisible({
            timeout: REAL_NDIF_TIMEOUT_MS * 2,
        });

        // The Export button triggers a server-action that returns a
        // notebook JSON string and then a client-side anchor download.
        // Align with the rest of the real-NDIF suite — the server action
        // can take noticeably longer under CI load than a fixed 30s.
        const downloadPromise = page.waitForEvent("download", {
            timeout: REAL_NDIF_TIMEOUT_MS,
        });
        await exportButton.click();
        const download = await downloadPromise;

        const suggested = download.suggestedFilename();
        expect(suggested).toMatch(/\.ipynb$/);

        // Read the notebook payload and assert it parses as JSON with the
        // expected Jupyter notebook schema.
        const stream = await download.createReadStream();
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(chunk as Buffer);
        const text = Buffer.concat(chunks).toString("utf-8");

        const notebook = JSON.parse(text);
        expect(notebook).toHaveProperty("cells");
        expect(Array.isArray(notebook.cells)).toBe(true);
        expect(notebook.cells.length).toBeGreaterThan(0);

        // The notebook should embed the nnsightful viz JS bundle plus the
        // widget invocation — that's the actual export contract. See
        // src/actions/notebook.ts > buildVisualizationHtml. Checking the
        // widget call site is the tightest signal that the standalone
        // charts.js was inlined (a stub or failed embed would still
        // mention "activation" in template prose but wouldn't produce
        // the invocation).
        const cellSources = notebook.cells.map((cell: { source?: string | string[] }) =>
            Array.isArray(cell.source) ? cell.source.join("") : (cell.source ?? ""),
        );
        const htmlOutputs = notebook.cells.flatMap(
            (cell: { outputs?: Array<{ data?: Record<string, string | string[]> }> }) =>
                (cell.outputs ?? []).flatMap((out) => {
                    const html = out.data?.["text/html"];
                    return html ? [Array.isArray(html) ? html.join("") : html] : [];
                }),
        );
        const allText = [...cellSources, ...htmlOutputs].join("\n");
        expect(allText.toLowerCase()).toContain("activation");
        expect(allText).toMatch(/ActivationPatchingWidget\s*\(\s*container/);
        expect(allText).toMatch(/<div id="lp_/);

        await argosScreenshot(page, "notebook-export-after", { fullPage: false });
    });
});
