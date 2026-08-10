import { describe, it, expect, beforeEach } from "bun:test";

import { clearDatabase } from "@/db/client";
import { getTutorialEventsForWorkspace } from "@/lib/queries/tutorialEventsDb";
import { useProlificTutorial } from "@/stores/useProlificTutorial";
import type { TutorialUnit } from "@/types/tutorial-content";

/**
 * The embedded check's answer key. It used to be read from whatever ran most
 * recently, anywhere in the tutorial, which mis-scored every participant who went
 * back through the steps to fill in checks they had skipped.
 */

const unit = (overrides: Partial<TutorialUnit>): TutorialUnit => ({
    id: "u",
    kind: "lens",
    title: "Unit",
    task: "task",
    concept: "concept",
    prompts: [],
    hints: [],
    observationPrompt: "What did you notice?",
    progression: { on: "run" },
    ...overrides,
});

const units: TutorialUnit[] = [
    unit({ id: "u0", check: { question: "What did it say?", kind: "topToken" } }),
    unit({
        id: "u4",
        kind: "patch",
        progression: { on: "patch" },
        check: { question: "What does the target say now?", kind: "topToken" },
    }),
    unit({ id: "u6", kind: "challenge", progression: { on: "manual" } }),
];

const store = () => useProlificTutorial.getState();

describe("useProlificTutorial answer keys", () => {
    beforeEach(() => {
        store().reset();
        store().setUnits(units);
        store().start();
    });

    it("keys each unit to its own run", () => {
        store().recordRun({ top: "Paris", second: " London", runId: "run-1" }, 0);
        expect(store().runTokensByUnit[0]).toEqual({
            topToken: "Paris",
            secondToken: " London",
            runId: "run-1",
        });
        expect(store().runTokensByUnit[1]).toBeUndefined();
    });

    it("a run on a later unit cannot move an earlier unit's key", () => {
        store().recordRun({ top: "Paris", second: " London" }, 0);
        // The participant walks to the final challenge and runs their own prompt
        // there. `next` twice, not goToUnit — the panel only offers Back and Next.
        store().next();
        store().next();
        expect(store().unitIdx).toBe(2);
        store().recordRun({ top: "\n", second: null }, 2);
        expect(store().runTokensByUnit[0]?.topToken).toBe("Paris");
        expect(store().runTokensByUnit[2]?.topToken).toBe("\n");
    });

    it("ignores a run filed against a unit that doesn't exist", () => {
        store().recordRun({ top: "Paris", second: null }, 99);
        expect(store().runTokensByUnit[99]).toBeUndefined();
    });

    it("freezes a key for units that don't progress on a run", () => {
        // A patch or challenge step treats a run as a prerequisite, not completion —
        // but its run is still what a run-scored check asks about.
        store().recordRun({ top: "Rome", second: null }, 1);
        expect(store().runTokensByUnit[1]?.topToken).toBe("Rome");
        expect(store().completedUnits).not.toContain(1);
    });

    it("takes the latest run on the same unit", () => {
        store().recordRun({ top: "Paris", second: null }, 0);
        store().recordRun({ top: "Rome", second: null }, 0);
        // The check asks about the most recent run, so re-running the same step
        // deliberately re-keys it.
        expect(store().runTokensByUnit[0]?.topToken).toBe("Rome");
    });

    it("ignores a run with no readable prediction", () => {
        store().recordRun({ top: null, second: null }, 0);
        expect(store().runTokensByUnit[0]).toBeUndefined();
    });

    it("keys a patch unit to its own patch result", () => {
        store().recordPatchResult("Paris", 1);
        expect(store().patchTokenByUnit[1]).toBe("Paris");
        expect(store().patchTokenByUnit[0]).toBeUndefined();
    });

    it("ignores an unreadable patch result, leaving the check gated", () => {
        store().recordPatchResult(null, 1);
        expect(store().patchTokenByUnit[1]).toBeUndefined();
    });

    it("forgets a patch result when the patch is undone", () => {
        store().recordPatchResult("Paris", 1);
        store().clearPatchResult(1);
        expect(store().patchTokenByUnit[1]).toBeUndefined();
    });

    it("refuses to file a patch result against a step that has no patch", () => {
        // A patch restored from a previous session is reported on mount, before the
        // participant has navigated anywhere — it must not land on step 1.
        store().recordPatchResult("Paris", 0);
        expect(store().patchTokenByUnit[0]).toBeUndefined();
    });

    it("drops every key when the tutorial is reset", () => {
        store().recordRun({ top: "Paris", second: null }, 0);
        store().recordPatchResult("Rome", 1);
        store().reset();
        expect(store().runTokensByUnit).toEqual({});
        expect(store().patchTokenByUnit).toEqual({});
    });

    it("persists a key that names its run, and never a patch outcome", () => {
        // Keys used to be withheld from localStorage entirely, so that an answer
        // could never be scored against a result no longer on screen. The run is
        // restored on reload now, so the rule is weaker but the guarantee is the
        // same: a persisted key carries its lens_runs id and is validated against
        // the run on screen (pruneRunKeys). A patch outcome still isn't persisted —
        // the widget re-reports it on mount.
        store().setWorkspace("ws-persist");
        store().setUnits(units);
        store().start();
        store().recordRun({ top: "Paris", second: " London", runId: "run-1" }, 0);
        store().recordPatchResult("Rome", 1);
        const persisted = globalThis.localStorage.getItem("workbench:prolific-tutorial") ?? "";
        expect(persisted).toContain("completedUnits");
        expect(persisted).toContain("run-1");
        expect(persisted).not.toContain("patchTokenByUnit");
    });

    it("won't persist a key it can't later verify", () => {
        // No run id means the history write failed, so there is nothing to check the
        // key against on reload. It stays usable for this session and stops there.
        store().setWorkspace("ws-persist-noid");
        store().setUnits(units);
        store().start();
        store().recordRun({ top: "Paris", second: null }, 0);
        expect(store().runTokensByUnit[0]?.topToken).toBe("Paris");
        const persisted = globalThis.localStorage.getItem("workbench:prolific-tutorial") ?? "";
        expect(persisted).toContain('"runTokensByUnit":{}');
    });

    it("keeps only the key belonging to the run on screen", () => {
        store().recordRun({ top: "Paris", second: null, runId: "run-1" }, 0);
        store().recordRun({ top: "Rome", second: null, runId: "run-old" }, 1);
        store().pruneRunKeys("run-1");
        expect(store().runTokensByUnit[0]?.topToken).toBe("Paris");
        expect(store().runTokensByUnit[1]).toBeUndefined();
    });

    it("trusts a key with no run id when pruning", () => {
        // It can only have come from this session (see above), so its result is the
        // one on screen — dropping it would re-gate a check the participant earned.
        store().recordRun({ top: "Paris", second: null }, 0);
        store().pruneRunKeys("run-1");
        expect(store().runTokensByUnit[0]?.topToken).toBe("Paris");
    });

    it("records one check answer per step", () => {
        store().answerCheck("Paris", true);
        expect(store().checkAnsweredByUnit[0]).toBe(true);
        // A second answer for the same step would double-count the engagement
        // measure; the store refuses it as well as the input locking.
        store().answerCheck("Rome", false);
        expect(store().checkAnsweredByUnit[0]).toBe(true);
    });

    it("keeps what was answered, not only that it was", () => {
        // A revisited step restates the answer, so the panel needs more than the
        // "already answered" boolean.
        store().answerCheck("Rome", false);
        expect(store().checkResultByUnit[0]).toEqual({ answer: "Rome", correct: false });
        // Same one-per-step rule as the boolean: the first answer is the record.
        store().answerCheck("Paris", true);
        expect(store().checkResultByUnit[0]).toEqual({ answer: "Rome", correct: false });
    });
});

describe("useProlificTutorial completion", () => {
    // Reaching the end of the activity is what finishes it; the last step used to
    // gate the survey handoff behind completing it.
    beforeEach(() => {
        store().reset();
        store().setUnits(units);
        store().start();
    });

    it("completes the final manual unit on arrival", () => {
        store().markReached(2);
        expect(store().completedUnits).toContain(2);
    });

    it("completes it only once, so a reload doesn't double-count", () => {
        store().markReached(2);
        store().markReached(2);
        expect(store().completedUnits.filter((i) => i === 2)).toHaveLength(1);
    });

    it("leaves a unit that isn't the last one alone", () => {
        store().markReached(0);
        expect(store().completedUnits).not.toContain(0);
    });

    it("leaves a final unit with an action of its own alone", () => {
        // A run- or patch-gated last step still has something to do; auto-completing
        // it would file a step_completed for work nobody did.
        store().setUnits([units[0]!, unit({ id: "u-run", progression: { on: "run" } })]);
        store().markReached(1);
        expect(store().completedUnits).not.toContain(1);
    });
});

describe("useProlificTutorial telemetry", () => {
    // The store mirrors every action to tutorial_events; these assertions read the
    // rows back rather than trusting the call.
    const workspaceId = "ws-telemetry";

    beforeEach(async () => {
        await clearDatabase();
        store().reset();
        store().setWorkspace(workspaceId);
        store().setUnits(units);
    });

    const timeline = async () => {
        // emit() is deliberately fire-and-forget, so let the writes land.
        await Bun.sleep(20);
        const events = await getTutorialEventsForWorkspace(workspaceId);
        return events.map((e) => `${e.eventType}:${e.stepId}`);
    };

    it("emits a step entry walking back as well as forward", async () => {
        // A check answered on a revisited step used to arrive with no preceding
        // step_started, which is what made a participant's route through the
        // tutorial impossible to reconstruct.
        store().start();
        store().next();
        store().prev();
        store().answerCheck("Paris", true);
        expect(await timeline()).toEqual([
            "step_started:u0",
            "step_started:u4",
            "step_started:u0",
            "check_answered:u0",
        ]);
    });

    it("emits one check_answered even if the check is answered twice", async () => {
        store().start();
        store().answerCheck("Paris", true);
        store().answerCheck("Rome", false);
        expect(await timeline()).toEqual(["step_started:u0", "check_answered:u0"]);
    });
});

describe("useProlificTutorial orientation slideshow", () => {
    beforeEach(() => {
        store().reset();
        store().setUnits(units);
    });

    it("opens on the first start and not on a resume", () => {
        store().start();
        expect(store().welcomeOpen).toBe(true);
        expect(store().welcomeSeen).toBe(true);

        // A participant who exits and comes back is resuming, not arriving: the
        // orientation would be re-reading something they have already dismissed.
        store().closeWelcome();
        store().stop();
        store().start();
        expect(store().welcomeOpen).toBe(false);
    });

    it("reopens on request, however it was dismissed", () => {
        store().start();
        store().closeWelcome();
        store().openWelcome();
        expect(store().welcomeOpen).toBe(true);
    });

    // Collapsed, the tutorial column is unmounted — and the walkthrough the
    // slideshow hands off to ends by pointing at it.
    it("uncollapses the panel when the orientation is reopened", () => {
        store().start();
        store().setCollapsed(true);
        store().openWelcome();
        expect(store().collapsed).toBe(false);
    });

    it("closes with the tutorial, so it can't outlive it", () => {
        store().start();
        store().stop();
        expect(store().welcomeOpen).toBe(false);
    });

    it("treats a new workspace as a new participant", () => {
        store().start();
        store().closeWelcome();
        store().setWorkspace("some-other-workspace");
        expect(store().welcomeSeen).toBe(false);
    });
});
