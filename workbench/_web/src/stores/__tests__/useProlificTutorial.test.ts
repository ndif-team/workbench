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
        store().recordRun({ top: "Paris", second: " London" }, 0);
        expect(store().runTokensByUnit[0]).toEqual({ topToken: "Paris", secondToken: " London" });
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

    it("keeps the answer keys out of localStorage", () => {
        // Load-bearing for "the check asks for a run again after a refresh": a
        // persisted key would score an answer against a result no longer on screen.
        store().setWorkspace("ws-persist");
        store().setUnits(units);
        store().start();
        store().recordRun({ top: "Paris", second: " London" }, 0);
        store().recordPatchResult("Rome", 1);
        const persisted = globalThis.localStorage.getItem("workbench:prolific-tutorial") ?? "";
        expect(persisted).toContain("completedUnits");
        expect(persisted).not.toContain("runTokensByUnit");
        expect(persisted).not.toContain("patchTokenByUnit");
    });

    it("records one check answer per step", () => {
        store().answerCheck("Paris", true);
        expect(store().checkAnsweredByUnit[0]).toBe(true);
        // A second answer for the same step would double-count the engagement
        // measure; the store refuses it as well as the input locking.
        store().answerCheck("Rome", false);
        expect(store().checkAnsweredByUnit[0]).toBe(true);
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
