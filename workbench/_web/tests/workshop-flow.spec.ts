import { test, expect, REAL_NDIF_TIMEOUT_MS } from "./fixtures";

/**
 * End-to-end workshop flow. A participant walks the Movement-2 sequence with
 * pre-cached payloads and zero live NDIF traffic.
 */

const TASK1_EXAMPLES = [
    "task1_ex1_51st_state",
    "task1_ex2_mri_inventor",
    "task1_ex3_bandura_paper",
    "task1_ex4_lamarr_coinventor",
    "task1_ex5_higgs_boson",
    "task1_ex6_foucault_surveillance",
];

test.describe("Workshop full flow", () => {
    test.setTimeout(REAL_NDIF_TIMEOUT_MS);

    test("walking the Movement-2 sequence makes zero live NDIF calls", async ({
        workbenchPage: page,
    }) => {
        const ndifCalls: string[] = [];
        page.on("request", (req) => {
            const url = req.url();
            if (url.includes("ndif.us")) ndifCalls.push(url);
        });

        await page.goto("/workshop");
        await expect(page.getByTestId("workshop-index")).toBeVisible({ timeout: 15_000 });

        // Branching opener
        await page.goto("/workshop/branching_demo_workshop");
        await expect(page.getByTestId("trajectory-comparison")).toBeVisible({ timeout: 15_000 });

        // 6 Task 1 examples (commitment-strip)
        for (const id of TASK1_EXAMPLES) {
            await page.goto(`/workshop/${id}`);
            await expect(page.getByTestId("commitment-strip")).toBeVisible({ timeout: 15_000 });
        }

        expect(ndifCalls).toHaveLength(0);
    });

    test("annotations persist across all task pages in one session", async ({
        workbenchPage: page,
    }) => {
        const note = `flow-test ${Date.now()}`;

        await page.goto("/workshop/task1_ex1_51st_state");
        await expect(page.getByTestId("annotation-textarea")).toBeVisible({ timeout: 15_000 });
        await page.getByTestId("annotation-textarea").fill(note);
        await page.waitForTimeout(1500); // debounced save

        await page.goto("/workshop/task1_ex2_mri_inventor");
        await expect(page.getByTestId("annotation-textarea")).toBeVisible({ timeout: 15_000 });
        const noteB = `${note}-second`;
        await page.getByTestId("annotation-textarea").fill(noteB);
        await page.waitForTimeout(1500);

        // Reload first page; original note should still be there.
        await page.goto("/workshop/task1_ex1_51st_state");
        await expect(page.getByTestId("annotation-textarea")).toHaveValue(note, {
            timeout: 15_000,
        });

        // Summary export must contain both notes.
        const downloadPromise = page.waitForEvent("download");
        await page.getByTestId("session-summary-export").first().click();
        const download = await downloadPromise;
        const path = await download.path();
        const fs = await import("node:fs");
        const text = fs.readFileSync(path, "utf8");
        expect(text).toContain(note);
        expect(text).toContain(noteB);
    });
});
