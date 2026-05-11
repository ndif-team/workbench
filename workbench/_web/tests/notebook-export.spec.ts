import {
    test,
    expect,
    argosScreenshot,
    gotoFreshAPWorkspace,
    REAL_NDIF_TIMEOUT_MS,
} from "./fixtures";

const SRC_PROMPT = "The Eiffel Tower is in the city of";
const TGT_PROMPT = "The Colosseum is in the city of";

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
        const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
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

        // Notebook cells should mention activation patching somewhere.
        const allSource = notebook.cells
            .map((cell: { source?: string | string[] }) =>
                Array.isArray(cell.source) ? cell.source.join("") : (cell.source ?? ""),
            )
            .join("\n");
        expect(allSource.toLowerCase()).toContain("activation");

        await argosScreenshot(page, "notebook-export-after", { fullPage: false });
    });
});
