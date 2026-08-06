import { describe, it, expect, beforeEach } from "bun:test";

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
        // The participant goes to the final challenge, runs their own prompt, then
        // comes back to the first step and re-runs it there.
        store().goToUnit(2);
        store().recordRun({ top: "\n", second: null }, 2);
        expect(store().runTokensByUnit[0]?.topToken).toBe("Paris");
        expect(store().runTokensByUnit[2]?.topToken).toBe("\n");
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

    it("drops every key when the tutorial is reset", () => {
        store().recordRun({ top: "Paris", second: null }, 0);
        store().recordPatchResult("Rome", 1);
        store().reset();
        expect(store().runTokensByUnit).toEqual({});
        expect(store().patchTokenByUnit).toEqual({});
    });
});
