import { test, expect, type Page } from "@playwright/test";
import {
    buildLensData,
    createTestUserOrStub,
    loginIfRequired,
    seedTutorialWorkspace,
    TUTORIAL_MODEL,
    type TestingUser,
} from "./TestingUtils";
import {
    CHECK_CASES,
    RUN_TOP_TOKEN,
    TOTAL_UNITS,
    TUTORIAL_CHECK_CONTENT,
    unitIndex,
    type CheckCase,
} from "./fixtures/tutorialCheckContent";

/**
 * E2E for the guided tutorial's embedded checks and note recap — the
 * "validate that answers are correctly labeled by driving the tutorial" half of
 * the verdicts work. Distinct from `patch-lens-features.spec.ts`'s
 * `patch-lens tutorial` block, which drives the *reactour* walkthrough
 * (`usePatchLensTutorial`); this drives the Prolific/classroom guided tutorial
 * (`useProlificTutorial`), which had no e2e coverage at all.
 *
 * No NDIF and no Python backend. A choice check needs no run to *score*
 * (`resolveCheckKey` returns `canAnswer: true` for them), but it may still need
 * one to be on screen: the panel withholds a step's check and note box until the
 * step's action is done (`hasDoneUnitAction`), so anything but a `manual` unit
 * has to be run first — see `openCheck` and the fixture's `needsRun`. Runs get a
 * stubbed `/logit_lens/start` returning `{ job_id: null, data }`, the shape
 * `startAndPoll` short-circuits on — while `createLensRun` still writes a real
 * `lens_runs` row, which is what makes the reload tests mean something.
 *
 * The high-value cases, in rough order:
 *   - per check: correct → data-correct="true"/state="fresh"; wrong → "false"
 *     plus the right key in the message; locked after one answer.
 *   - progressive reveal: a run-gated step renders neither its check nor its note
 *     box until the prompt has been run, in both check shapes — and an answered
 *     check and a saved note stay on screen even when the run key is gone.
 *   - R1: answer → reload → the same verdict restated as data-state="prior",
 *     data-correct unchanged. This is the revisit case the pilot got wrong.
 *   - R2: the stale-key reproduction — a run on a later step must not re-key an
 *     earlier step's check.
 *   - the neutral override: answering it renders NO verdict element at all.
 *   - notes: written on two steps, attributed to the right step ids, surviving
 *     a reload (the DB read path), and recapped on the completion screen.
 *
 * Reset between "answers correctly" and "answers incorrectly" is Playwright's
 * per-test context isolation and nothing else: the one-answer lock lives in the
 * persisted `checkAnsweredByUnit` plus `EmbeddedCheck`'s local `result`, so two
 * `test()`s with fresh contexts are two fresh participants.
 */

// Keep in sync with stores/useProlificTutorial.ts (the persist `name`).
const STORE_KEY = "workbench:prolific-tutorial";

/**
 * Seeded workspaces are keyed by slot, and slots are keyed by **worker index**.
 *
 * `beforeAll` runs once per worker process, not once per run, and
 * `seedTutorialWorkspace` is delete-then-insert on fixed ids. Under
 * `fullyParallel` a second worker would therefore delete and re-insert the very
 * rows the first worker's tests are mid-way through reading — a 404 with no
 * obvious cause. Giving each worker its own slot keeps the seed idempotent per
 * worker and the specs genuinely parallel. (CI pins `workers: 1`, so this is
 * about the local run, which is where the dry-run rehearsal happens.)
 *
 * Two slots per worker: checks, and the notes test, which asserts on an *empty*
 * tutorial_events history and so cannot share a workspace the check tests write
 * `check_answered` rows into.
 */
const SLOTS_PER_WORKER = 2;
const checksSlot = (workerIndex: number) => workerIndex * SLOTS_PER_WORKER;
const notesSlot = (workerIndex: number) => workerIndex * SLOTS_PER_WORKER + 1;

let user: TestingUser;
let checksWorkspaceId: string;
let checksUrl: string;

test.beforeAll(async ({}, workerInfo) => {
    user = await createTestUserOrStub();
    const seeded = await seedTutorialWorkspace(
        user.user_id,
        TUTORIAL_CHECK_CONTENT,
        checksSlot(workerInfo.workerIndex),
    );
    checksWorkspaceId = seeded.workspaceId;
    checksUrl = `/workbench/${seeded.workspaceId}/patch-lens/${seeded.chartId}`;
});

// ---------------------------------------------------------------------------
// Locators. The panel is a portal, so everything is scoped to its <section>.
// ---------------------------------------------------------------------------

const panel = (page: Page) => page.locator('section[aria-label="Guided tutorial"]');
const checkRoot = (page: Page) => panel(page).getByTestId("tutorial-check");
const verdict = (page: Page) => panel(page).getByTestId("tutorial-check-verdict");
const stepCounter = (page: Page) => panel(page).getByText(/^Step \d+ of \d+$/);
/** The note box's textarea, found by the unit's own reflective prompt (its label). */
const noteField = (page: Page, unitIdx: number) =>
    panel(page).getByLabel(TUTORIAL_CHECK_CONTENT.units[unitIdx].observationPrompt, {
        exact: true,
    });
const noteSaved = (page: Page) => panel(page).getByText("✓ Thanks — your note was saved.");
const notesTrigger = (page: Page) =>
    panel(page).getByRole("button", { name: "Your notes from earlier steps" });
const notesPopover = (page: Page) => page.getByRole("dialog").filter({ hasText: "What you" });

/**
 * A completed lens run, on demand, with no model.
 *
 * `finalToken` is mutable so a single test can serve two *different* runs — the
 * stale-key reproduction needs the second step's run to disagree with the
 * first's, which is exactly the condition that mis-scored the pilot.
 *
 * `/models/` is stubbed too: `executeRun` bails with a toast when
 * `selectedModel` is undefined, so without a catalog the run-scored checks can
 * never open. The one entry's name matches the seeded workshop's pinned model.
 */
async function stubBackend(page: Page): Promise<{ finalToken: string }> {
    const state = { finalToken: RUN_TOP_TOKEN };
    await page.route("**/models/**", (route) =>
        route.fulfill({
            json: [
                {
                    name: TUTORIAL_MODEL,
                    is_chat: false,
                    n_layers: 32,
                    params: "124M",
                    gated: false,
                    allowed: true,
                    status: "hot",
                },
            ],
        }),
    );
    await page.route("**/logit_lens/start", (route) =>
        route.fulfill({ json: { job_id: null, data: buildLensData(state.finalToken) } }),
    );
    return state;
}

/**
 * Put the participant on step `unitIdx` with the orientation already seen.
 *
 * Writing the store's persisted key with the *seeded* workspace id is the lever
 * that makes this fast and non-flaky: `setWorkspace` early-returns when the id
 * already matches, so it never wipes `welcomeSeen` and the welcome dialog never
 * opens over the panel.
 *
 * The `getItem` guard matters as much. Init scripts re-run on every navigation,
 * so an unguarded write would clobber the participant's own progress on
 * `page.reload()` — and the reload tests are the point of this file.
 */
async function landOnStep(
    page: Page,
    workspaceId: string,
    unitIdx: number,
    /**
     * Extra persisted store fields, merged over the blank-slate defaults below.
     *
     * The blank slate is what most tests want. This is for staging progress that
     * the app itself cannot be driven into within one page life — notably a step
     * whose check is answered and whose note is written while `runTokensByUnit` is
     * empty, which is exactly the state `pruneRunKeys` leaves behind after a
     * reload and the state the reveal override has to survive.
     */
    extra: Record<string, unknown> = {},
) {
    await page.addInitScript(
        (seed: {
            key: string;
            workspaceId: string;
            unitIdx: number;
            extra: Record<string, unknown>;
        }) => {
            try {
                if (localStorage.getItem(seed.key)) return;
                localStorage.setItem(
                    seed.key,
                    JSON.stringify({
                        state: {
                            workspaceId: seed.workspaceId,
                            active: true,
                            unitIdx: seed.unitIdx,
                            welcomeSeen: true,
                            attemptsByUnit: {},
                            hintStageByUnit: {},
                            completedUnits: [],
                            checkAnsweredByUnit: {},
                            checkResultByUnit: {},
                            observationByUnit: {},
                            runTokensByUnit: {},
                            panelPos: null,
                            collapsed: false,
                            ...seed.extra,
                        },
                        version: 0,
                    }),
                );
            } catch {
                /* about:blank has no accessible storage — the next document does */
            }
        },
        { key: STORE_KEY, workspaceId, unitIdx, extra },
    );
}

/** Wait for the tutorial column: content arrives from the DB a tick after mount. */
async function expectPanel(page: Page) {
    await expect(panel(page)).toBeVisible({ timeout: 30_000 });
}

async function expectStep(page: Page, unitIdx: number) {
    await expect(stepCounter(page)).toHaveText(`Step ${unitIdx + 1} of ${TOTAL_UNITS}`);
}

/** Click the unit's prompt-bank entry, which fills the prompt AND runs it. */
async function runUnitPrompt(page: Page, unitIdx: number) {
    const prompt = TUTORIAL_CHECK_CONTENT.units[unitIdx].prompts[0];
    await panel(page).getByRole("button", { name: prompt, exact: true }).click();
}

/** Answer a check. `value` is an option label, or the text to type. */
async function answerCheck(page: Page, c: CheckCase, value: string) {
    const root = checkRoot(page);
    if (c.kind === "choice") {
        await root
            .getByRole("group", { name: c.question })
            .getByRole("button", { name: value, exact: true })
            .click();
        return;
    }
    await root.getByLabel(c.question, { exact: true }).fill(value);
    // The submit label is itself a signal: "Check" promises a verdict, "Submit"
    // does not. Asserted on its own below; used here to find the button.
    await root
        .getByRole("button", { name: c.feedback === "verdict" ? "Check" : "Submit", exact: true })
        .click();
}

/**
 * Get the check on screen and answerable.
 *
 * The panel reveals a step's check and note box only once the step's action is
 * done (`hasDoneUnitAction`), so on anything but a `manual` unit the check does
 * not exist in the DOM until the prompt has been run — hence `needsRun`, which
 * the fixture reads off the unit's progression.
 *
 * Waits on the check *root*, not on `getByLabel(question)`: that label is the
 * typed input's accessible name and a choice check has no input at all, so the
 * old wait silently no-op'd for the shape that now also has to be revealed.
 */
async function openCheck(page: Page, c: CheckCase) {
    if (c.needsRun) await runUnitPrompt(page, c.unitIdx);
    await expect(checkRoot(page)).toBeVisible({ timeout: 30_000 });
}

/** The check is locked after one answer, whichever shape it is. */
async function expectLocked(page: Page, c: CheckCase) {
    const root = checkRoot(page);
    if (c.kind === "choice") {
        await expect(
            root
                .getByRole("group", { name: c.question })
                .getByRole("button", { name: c.correctAnswer, exact: true }),
        ).toBeDisabled();
        return;
    }
    await expect(root.getByLabel(c.question, { exact: true })).toBeDisabled();
}

/**
 * Advance one step. `handleNext` nudges: the first click on an unfinished step
 * shows the finish hint instead of advancing, and a second click moves on
 * anyway — so wait for whichever of the two landed before deciding.
 */
async function advanceOneStep(page: Page, fromIdx: number) {
    const p = panel(page);
    const counter = stepCounter(page);
    const next = p.getByRole("button", { name: "Next step" });
    const nudge = p.getByText("(or click Next again to move on.)");
    const want = `Step ${fromIdx + 2} of ${TOTAL_UNITS}`;

    await next.click();
    await expect
        .poll(
            async () =>
                ((await counter.textContent()) ?? "").trim() === want || (await nudge.isVisible()),
            { timeout: 10_000 },
        )
        .toBeTruthy();
    if (((await counter.textContent()) ?? "").trim() !== want) await next.click();
    await expect(counter).toHaveText(want);
}

test.describe("guided tutorial checks (seeded tutorial, no NDIF)", () => {
    test.beforeEach(async ({ page }) => {
        await loginIfRequired(page, user);
        // Wide enough for the docked tutorial column (the floating fallback is a
        // different placement) and to keep the bottom-center toasts clear of it.
        await page.setViewportSize({ width: 1440, height: 900 });
    });

    // ---- Generated per-check cases: adding a check to the fixture adds tests ----

    for (const c of CHECK_CASES.filter((x) => x.feedback === "verdict")) {
        test(`${c.unitId}: a correct answer is labeled correct`, async ({ page }) => {
            await stubBackend(page);
            await landOnStep(page, checksWorkspaceId, c.unitIdx);
            await page.goto(checksUrl);
            await expectPanel(page);
            await expectStep(page, c.unitIdx);

            await openCheck(page, c);
            await answerCheck(page, c, c.correctAnswer);

            const v = verdict(page);
            await expect(v).toBeVisible();
            await expect(v).toHaveAttribute("data-correct", "true");
            await expect(v).toHaveAttribute("data-state", "fresh");
            await expectLocked(page, c);
        });

        test(`${c.unitId}: a wrong answer is labeled wrong and names the key`, async ({ page }) => {
            await stubBackend(page);
            await landOnStep(page, checksWorkspaceId, c.unitIdx);
            await page.goto(checksUrl);
            await expectPanel(page);

            await openCheck(page, c);
            await answerCheck(page, c, c.wrongAnswer);

            const v = verdict(page);
            await expect(v).toBeVisible();
            await expect(v).toHaveAttribute("data-correct", "false");
            await expect(v).toHaveAttribute("data-state", "fresh");
            // The answer key has to reach the screen — a "not quite" that names
            // nothing is the failure mode the verdict exists to avoid. Substring,
            // not the whole interpolated string: the punctuation is pinned once,
            // in the copy-guard test below.
            await expect(v).toContainText(c.expectedKey.trim());
            await expectLocked(page, c);
        });
    }

    for (const c of CHECK_CASES.filter((x) => x.feedback === "neutral")) {
        test(`${c.unitId}: a neutral check renders no verdict at all`, async ({ page }) => {
            await stubBackend(page);
            await landOnStep(page, checksWorkspaceId, c.unitIdx);
            await page.goto(checksUrl);
            await expectPanel(page);
            await expectStep(page, c.unitIdx);

            await openCheck(page, c);
            // A neutral check is still *scored* — it just never says so. Answer
            // the one that happens to be right, so a leaked verdict can't hide
            // behind "well, it was wrong".
            await answerCheck(page, c, c.correctAnswer);

            await expect(checkRoot(page).getByText("Answer recorded.")).toBeVisible();
            // The negative assertion this whole fixture is built around.
            await expect(verdict(page)).toHaveCount(0);
            await expectLocked(page, c);
        });
    }

    // ---- Progressive reveal: the check and the note box arrive with the action ----

    // One per check shape, and the shapes are the point. A choice check's answer
    // key resolves with no run at all, so a reveal wired to the answer-key gate
    // would leave `u2-inherit` on screen from the start and only the typed case
    // would fail; a reveal wired to `kind` would do the reverse.
    for (const unitId of ["u2-inherit", "u4-run-top"] as const) {
        test(`progressive reveal: ${unitId} withholds its check and note box until the run`, async ({
            page,
        }) => {
            const c = CHECK_CASES.find((x) => x.unitId === unitId)!;
            // Guard the premise: a `manual` unit reveals immediately and this test
            // would assert nothing.
            expect(c.needsRun, `${unitId} must be run-gated for this test to mean anything`).toBe(
                true,
            );
            const u = TUTORIAL_CHECK_CONTENT.units[c.unitIdx];

            await stubBackend(page);
            await landOnStep(page, checksWorkspaceId, c.unitIdx);
            await page.goto(checksUrl);
            await expectPanel(page);
            await expectStep(page, c.unitIdx);

            // Everything that helps them perform the action is there from the
            // start. Gating these too would be a different (worse) feature.
            await expect(panel(page).getByText(u.task, { exact: true })).toBeVisible();
            await expect(
                panel(page).getByRole("button", { name: u.prompts[0], exact: true }),
            ).toBeVisible();
            await expect(
                panel(page).getByRole("button", { name: /^Start this step fresh/ }),
            ).toBeVisible();

            // The two things that were competing with it are not rendered at all —
            // absent from the DOM, not merely hidden, so a participant cannot tab
            // into the note box before they have run anything.
            await expect(checkRoot(page)).toHaveCount(0);
            await expect(noteField(page, c.unitIdx)).toHaveCount(0);

            await runUnitPrompt(page, c.unitIdx);

            // ...and both arrive together on the one action.
            await expect(checkRoot(page)).toBeVisible({ timeout: 30_000 });
            await expect(checkRoot(page)).toContainText(c.question);
            await expect(noteField(page, c.unitIdx)).toBeVisible();
        });
    }

    test("progressive reveal: an answered check and a saved note outrank a pruned run key", async ({
        page,
    }) => {
        // The override, staged rather than driven, because the app cannot be put
        // into this state inside one page life: `runTokensByUnit` is persisted only
        // for entries naming a `lens_runs` row and is pruned on load against the
        // chart's `activeLensRunId` (`pruneRunKeys`), so after a reload a step the
        // participant genuinely finished can read as never run. Without the
        // override, the check they already answered and the note they already wrote
        // would both vanish from the step that holds them.
        const c = CHECK_CASES.find((x) => x.unitId === "u2-inherit")!;
        await stubBackend(page);
        await landOnStep(page, checksWorkspaceId, c.unitIdx, {
            // Answered and noted, with no run key and the step not marked complete:
            // each of the three overrides is on its own here.
            checkAnsweredByUnit: { [c.unitIdx]: true },
            checkResultByUnit: { [c.unitIdx]: { answer: c.correctAnswer, correct: true } },
            observationByUnit: { [c.unitIdx]: true },
            runTokensByUnit: {},
            completedUnits: [],
        });
        await page.goto(checksUrl);
        await expectPanel(page);
        await expectStep(page, c.unitIdx);

        // Their own answer, restated.
        await expect(checkRoot(page)).toBeVisible({ timeout: 15_000 });
        await expect(verdict(page)).toHaveAttribute("data-state", "prior");
        await expect(verdict(page)).toHaveAttribute("data-correct", "true");
        // And their own note, still acknowledged.
        await expect(noteSaved(page)).toBeVisible();
    });

    test("typed checks label their submit button by whether a verdict is coming", async ({
        page,
    }) => {
        const verdictCase = CHECK_CASES.find(
            (c) => c.kind !== "choice" && c.feedback === "verdict",
        );
        const neutralCase = CHECK_CASES.find(
            (c) => c.kind !== "choice" && c.feedback === "neutral",
        );
        expect(verdictCase, "fixture must have a typed verdict check").toBeTruthy();
        expect(neutralCase, "fixture must have a typed neutral check").toBeTruthy();

        await stubBackend(page);
        await landOnStep(page, checksWorkspaceId, verdictCase!.unitIdx);
        await page.goto(checksUrl);
        await expectPanel(page);

        await openCheck(page, verdictCase!);
        await expect(
            checkRoot(page).getByRole("button", { name: "Check", exact: true }),
        ).toBeVisible();

        // Walk to the neutral typed check. Both are run-gated, so the step the
        // run just completed advances on a single click.
        for (let idx = verdictCase!.unitIdx; idx < neutralCase!.unitIdx; idx++) {
            await advanceOneStep(page, idx);
        }
        await openCheck(page, neutralCase!);
        await expect(
            checkRoot(page).getByRole("button", { name: "Submit", exact: true }),
        ).toBeVisible();
        await expect(
            checkRoot(page).getByRole("button", { name: "Check", exact: true }),
        ).toHaveCount(0);
    });

    test("verdict copy guard: the four visible verdict strings", async ({ page }) => {
        // Pinned once, on one choice check with static keys. Asserting the curly
        // quotes (U+201C/U+201D) and the em-dash on every case would produce a
        // suite that fails on a copy tweak and gets deleted; asserting them
        // nowhere would let the interpolation break silently.
        const c = CHECK_CASES.find((x) => x.unitId === "u1-layer")!;
        const key = c.expectedKey;

        // Fresh + correct.
        await stubBackend(page);
        await landOnStep(page, checksWorkspaceId, c.unitIdx);
        await page.goto(checksUrl);
        await expectPanel(page);
        await answerCheck(page, c, c.correctAnswer);
        await expect(verdict(page)).toHaveText("✓ Correct.");

        // Prior + correct, after a reload.
        await page.reload();
        await expectPanel(page);
        await expect(verdict(page)).toHaveText(`✓ You answered “${c.correctAnswer}” — correct.`);
    });

    test("verdict copy guard: the wrong-answer strings", async ({ page }) => {
        const c = CHECK_CASES.find((x) => x.unitId === "u1-layer")!;

        await stubBackend(page);
        await landOnStep(page, checksWorkspaceId, c.unitIdx);
        await page.goto(checksUrl);
        await expectPanel(page);
        await answerCheck(page, c, c.wrongAnswer);
        await expect(verdict(page)).toHaveText(`Not quite — the answer was “${c.expectedKey}”.`);

        await page.reload();
        await expectPanel(page);
        await expect(verdict(page)).toHaveText(
            `You answered “${c.wrongAnswer}” — not quite. The answer was “${c.expectedKey}”.`,
        );
    });

    // ---- R1: the revisit case ----

    for (const shape of ["correct", "wrong"] as const) {
        test(`R1: a reload restates the same verdict (${shape})`, async ({ page }) => {
            // The highest-value test here. A participant who reloads mid-step
            // used to be told they hadn't run anything; the fix restates their
            // own answer, and this pins that the restated verdict AGREES with
            // the one they were given.
            const c = CHECK_CASES.find((x) => x.unitId === "u4-run-top")!;
            const answer = shape === "correct" ? c.correctAnswer : c.wrongAnswer;
            const want = shape === "correct" ? "true" : "false";

            await stubBackend(page);
            await landOnStep(page, checksWorkspaceId, c.unitIdx);
            await page.goto(checksUrl);
            await expectPanel(page);

            await openCheck(page, c);
            await answerCheck(page, c, answer);
            await expect(verdict(page)).toHaveAttribute("data-correct", want);
            await expect(verdict(page)).toHaveAttribute("data-state", "fresh");

            await page.reload();
            await expectPanel(page);
            await expectStep(page, c.unitIdx);

            const v = verdict(page);
            await expect(v).toBeVisible({ timeout: 15_000 });
            await expect(v).toHaveAttribute("data-state", "prior");
            // Unchanged across the reload — the whole point.
            await expect(v).toHaveAttribute("data-correct", want);
            await expect(v).toContainText(answer);
            // And still locked, so a revisit can't produce a second
            // check_answered row.
            await expectLocked(page, c);
        });
    }

    // ---- R2: the stale-key reproduction ----

    // The token the later step's run predicts. Anything but `RUN_TOP_TOKEN`:
    // the point is that the two runs disagree.
    const R2_LATER_TOKEN = " Rome";

    /**
     * Drive the stale-key scenario and leave the earlier step's check answered
     * with `answer`. Shared by the two variants below, which are a matched pair:
     * asserting only that the earlier run's token scores correct would still pass
     * if the key had somehow become *both*, so the negative variant pins that the
     * later run's token scores WRONG on the earlier step.
     */
    const driveStaleKey = async (page: Page, answer: string) => {
        const first = CHECK_CASES.find((x) => x.unitId === "u4-run-top")!;
        const second = CHECK_CASES.find((x) => x.unitId === "u5-run-second")!;

        const backend = await stubBackend(page);
        await landOnStep(page, checksWorkspaceId, first.unitIdx);
        await page.goto(checksUrl);
        await expectPanel(page);

        // Run on the first step, but don't answer yet.
        await runUnitPrompt(page, first.unitIdx);
        await expect(checkRoot(page).getByLabel(first.question, { exact: true })).toBeVisible({
            timeout: 30_000,
        });

        // Walk forward and run something that predicts a DIFFERENT token. Under
        // the pilot bug this became the earlier step's answer key, and the
        // participant who went back to fill in their check was marked wrong for
        // reading their own run correctly.
        await advanceOneStep(page, first.unitIdx);
        await expectStep(page, second.unitIdx);
        backend.finalToken = R2_LATER_TOKEN;
        await runUnitPrompt(page, second.unitIdx);
        await expect(checkRoot(page).getByLabel(second.question, { exact: true })).toBeVisible({
            timeout: 30_000,
        });

        // Walk back and answer the first step, which must be scored against its
        // OWN run.
        await panel(page).getByRole("button", { name: "Back" }).click();
        await expectStep(page, first.unitIdx);
        await answerCheck(page, first, answer);
        return { first };
    };

    test("R2: an earlier step's check scores against its own run", async ({ page }) => {
        const { first } = await driveStaleKey(page, RUN_TOP_TOKEN.trim());
        const v = verdict(page);
        await expect(v).toBeVisible();
        await expect(v).toHaveAttribute("data-correct", "true");
        expect(first.correctAnswer).toBe(RUN_TOP_TOKEN.trim());
    });

    test("R2: the later step's token is wrong on the earlier step", async ({ page }) => {
        // The reproduction proper. Under the pilot bug this answer was marked
        // CORRECT — the later run had moved the key out from under the step.
        await driveStaleKey(page, R2_LATER_TOKEN.trim());
        const v = verdict(page);
        await expect(v).toBeVisible();
        await expect(v).toHaveAttribute("data-correct", "false");
        // And the key it names is the earlier step's own run.
        await expect(v).toContainText(RUN_TOP_TOKEN.trim());
    });

    // ---- The honest path: no seeded store at all ----

    test("honest path: the welcome dialog, then walking the first two steps", async ({ page }) => {
        // No init script. A workshop-linked workspace auto-starts the guided
        // tutorial, which on a first visit opens the orientation slideshow —
        // dismissed with "Skip", never the tour CTA (that launches reactour,
        // which overlays everything the rest of this file clicks).
        await stubBackend(page);
        await page.goto(checksUrl);

        const slide = TUTORIAL_CHECK_CONTENT.welcome!.slides[0].title;
        await expect(page.getByText(slide)).toBeVisible({ timeout: 30_000 });
        await page.getByRole("button", { name: "Skip", exact: true }).click();

        await expectPanel(page);
        await expectStep(page, 0);

        const c = CHECK_CASES[0];
        await answerCheck(page, c, c.correctAnswer);
        await expect(verdict(page)).toHaveAttribute("data-correct", "true");

        // The nudge, explicitly: the first click on an unfinished step shows the
        // finish hint rather than advancing.
        await panel(page).getByRole("button", { name: "Next step" }).click();
        await expect(panel(page).getByText("(or click Next again to move on.)")).toBeVisible();
        await expectStep(page, 0);
        await panel(page).getByRole("button", { name: "Next step" }).click();
        await expectStep(page, 1);
    });
});

// ---------------------------------------------------------------------------
// Notes. Own per-worker workspace slot, reseeded per test: these assert on an empty
// starting history, which the shared checks workspace never has.
// ---------------------------------------------------------------------------

test.describe("guided tutorial notes", () => {
    const noteRows = (scope: ReturnType<typeof panel>) => scope.getByTestId("tutorial-note");

    test("notes are attributed to the right step, survive a reload, and are recapped", async ({
        page,
    }, testInfo) => {
        await loginIfRequired(page, user);
        await page.setViewportSize({ width: 1440, height: 900 });

        // Reseed our own slot inside the test: `tutorial_events` is append-only,
        // so a CI retry would otherwise start with the previous attempt's notes
        // and fail the empty-state assertion below.
        const seeded = await seedTutorialWorkspace(
            user.user_id,
            TUTORIAL_CHECK_CONTENT,
            notesSlot(testInfo.workerIndex),
        );
        const url = `/workbench/${seeded.workspaceId}/patch-lens/${seeded.chartId}`;
        const nonce = Math.random().toString(36).slice(2, 8);
        const firstIdx = unitIndex("u0-top1");
        const secondIdx = unitIndex("u1-layer");
        const noteA = `note-step-1-${nonce}`;
        const noteB = `note-step-2-${nonce}`;

        await stubBackend(page);
        await landOnStep(page, seeded.workspaceId, firstIdx);
        await page.goto(url);
        await expectPanel(page);

        const saveNote = async (unitIdx: number, text: string) => {
            const prompt = TUTORIAL_CHECK_CONTENT.units[unitIdx].observationPrompt;
            await panel(page).getByLabel(prompt, { exact: true }).fill(text);
            await panel(page).getByRole("button", { name: "Save note", exact: true }).click();
            await expect(panel(page).getByText("✓ Thanks — your note was saved.")).toBeVisible();
        };
        const openNotes = async () => {
            await notesTrigger(page).click();
            await expect(notesPopover(page)).toBeVisible();
            return notesPopover(page);
        };
        const closeNotes = async () => {
            await page.keyboard.press("Escape");
            await expect(notesPopover(page)).toHaveCount(0);
        };

        // Empty state first: nothing saved, and no note rows at all.
        let pop = await openNotes();
        await expect(pop.getByText("Nothing saved yet.", { exact: false })).toBeVisible();
        await expect(pop.getByTestId("tutorial-note")).toHaveCount(0);
        await closeNotes();

        await saveNote(firstIdx, noteA);
        pop = await openNotes();
        await expect(pop.getByTestId("tutorial-note")).toHaveCount(1);
        await expect(pop.getByTestId("tutorial-note")).toHaveAttribute("data-step-id", "u0-top1");
        await expect(pop.getByTestId("tutorial-note")).toContainText(noteA);
        await closeNotes();

        // Saving an observation completes a manual unit, so one click advances.
        await advanceOneStep(page, firstIdx);
        await expectStep(page, secondIdx);

        // The off-by-one failure mode presents exactly as "my last note shows up
        // everywhere": a step with no note of its own must not borrow the
        // previous step's.
        pop = await openNotes();
        await expect(pop.getByTestId("tutorial-note")).toHaveCount(1);
        await expect(pop.locator('[data-step-id="u1-layer"]')).toHaveCount(0);
        await closeNotes();

        await saveNote(secondIdx, noteB);
        pop = await openNotes();
        // An <ol> of <li> rows, in unit order.
        await expect(pop.locator("ol > li[data-testid='tutorial-note']")).toHaveCount(2);
        await expect(pop.getByTestId("tutorial-note").nth(0)).toHaveAttribute(
            "data-step-id",
            "u0-top1",
        );
        await expect(pop.getByTestId("tutorial-note").nth(0)).toContainText(noteA);
        await expect(pop.getByTestId("tutorial-note").nth(1)).toHaveAttribute(
            "data-step-id",
            "u1-layer",
        );
        await expect(pop.getByTestId("tutorial-note").nth(1)).toContainText(noteB);
        await closeNotes();

        // Reload: the notes query is `staleTime: Infinity` and kept warm by the
        // optimistic write on save, so only a reload (or reopening the popover)
        // exercises the actual DB read path. This is that assertion.
        await page.reload();
        await expectPanel(page);
        pop = await openNotes();
        await expect(pop.getByTestId("tutorial-note")).toHaveCount(2);
        await expect(pop.getByTestId("tutorial-note").nth(0)).toHaveAttribute(
            "data-step-id",
            "u0-top1",
        );
        await expect(pop.getByTestId("tutorial-note").nth(1)).toHaveAttribute(
            "data-step-id",
            "u1-layer",
        );
        await expect(pop.getByTestId("tutorial-note").nth(1)).toContainText(noteB);
        await closeNotes();

        // Walk to the end. The final unit is manual, so `markReached` completes
        // it on arrival and the completion recap renders.
        for (let idx = secondIdx; idx < TOTAL_UNITS - 1; idx++) {
            await advanceOneStep(page, idx);
        }
        await expectStep(page, TOTAL_UNITS - 1);

        // The finish screen, and the recap under it. Scoped to the panel rather
        // than to a hasText-filtered <div>: the popover is closed, so the only
        // note rows left on the page are the recap's, and a nested-div locator
        // would break on any wrapper change.
        await expect(panel(page).getByText("You’re done — thank you!")).toBeVisible();
        await expect(panel(page).getByText("What you noticed", { exact: true })).toBeVisible();
        const recapRows = noteRows(panel(page));
        await expect(recapRows).toHaveCount(2);
        await expect(recapRows.nth(0)).toHaveAttribute("data-step-id", "u0-top1");
        await expect(recapRows.nth(0)).toContainText(noteA);
        await expect(recapRows.nth(1)).toHaveAttribute("data-step-id", "u1-layer");
        await expect(recapRows.nth(1)).toContainText(noteB);
    });

    /**
     * A note is a way back to the step it was written on, from both surfaces
     * that list notes. The two are one test on purpose: reaching the completion
     * recap means walking the whole tutorial, so it rides along after the
     * popover case rather than paying for a second walk.
     *
     * The jump target is found by its accessible name ("Go to step 1: The top
     * prediction"), which is the assertion as much as the locator — the visible
     * "Step 1 · …" heading plus a paragraph of the participant's own prose would
     * be a useless name for a screen reader.
     *
     * A note whose unit is gone from the content renders no button at all. That
     * needs a tutorial edited between sessions, which this harness can't stage
     * (seedTutorialWorkspace deletes and re-inserts the workspace, notes and
     * all); it is covered by the `stepNumber: null` branch, whose input side is
     * unit-tested in `src/lib/__tests__/tutorialNotes.test.ts`.
     */
    test("a note jumps back to its step, from the popover and from the recap", async ({
        page,
    }, testInfo) => {
        await loginIfRequired(page, user);
        await page.setViewportSize({ width: 1440, height: 900 });

        const seeded = await seedTutorialWorkspace(
            user.user_id,
            TUTORIAL_CHECK_CONTENT,
            notesSlot(testInfo.workerIndex),
        );
        const url = `/workbench/${seeded.workspaceId}/patch-lens/${seeded.chartId}`;
        const nonce = Math.random().toString(36).slice(2, 8);
        const firstIdx = unitIndex("u0-top1");
        const secondIdx = unitIndex("u1-layer");
        const noteA = `jump-note-1-${nonce}`;
        const noteB = `jump-note-2-${nonce}`;
        const jumpTo = (idx: number) =>
            `Go to step ${idx + 1}: ${TUTORIAL_CHECK_CONTENT.units[idx].title}`;

        await stubBackend(page);
        await landOnStep(page, seeded.workspaceId, firstIdx);
        await page.goto(url);
        await expectPanel(page);

        const saveNote = async (unitIdx: number, text: string) => {
            const prompt = TUTORIAL_CHECK_CONTENT.units[unitIdx].observationPrompt;
            await panel(page).getByLabel(prompt, { exact: true }).fill(text);
            await panel(page).getByRole("button", { name: "Save note", exact: true }).click();
            await expect(panel(page).getByText("✓ Thanks — your note was saved.")).toBeVisible();
        };

        await saveNote(firstIdx, noteA);
        await advanceOneStep(page, firstIdx);
        await expectStep(page, secondIdx);
        await saveNote(secondIdx, noteB);

        // From the popover: click the first step's note while standing on the
        // second, and land on the first.
        await notesTrigger(page).click();
        const pop = notesPopover(page);
        await expect(pop).toBeVisible();
        const firstRowJump = pop.getByRole("button", { name: jumpTo(firstIdx) });
        await expect(firstRowJump).toContainText(noteA);
        await firstRowJump.click();
        await expectStep(page, firstIdx);
        // The popover must get out of the way — otherwise it covers the step it
        // just navigated to.
        await expect(notesPopover(page)).toHaveCount(0);

        // Walk to the end for the recap.
        for (let idx = firstIdx; idx < TOTAL_UNITS - 1; idx++) {
            await advanceOneStep(page, idx);
        }
        await expectStep(page, TOTAL_UNITS - 1);
        await expect(panel(page).getByText("What you noticed", { exact: true })).toBeVisible();

        // From the recap: the same row, keyboard-activated, since these are real
        // buttons and not click handlers on the <li>.
        const recapJump = panel(page).getByRole("button", { name: jumpTo(secondIdx) });
        await expect(recapJump).toContainText(noteB);
        await recapJump.focus();
        await page.keyboard.press("Enter");
        await expectStep(page, secondIdx);
        // The recap is appended to the final unit's step view, so leaving that
        // unit takes it away.
        await expect(panel(page).getByText("What you noticed", { exact: true })).toHaveCount(0);
        await expect(noteRows(panel(page))).toHaveCount(0);
    });
});
