import { describe, it, expect } from "bun:test";

import { hasDoneUnitAction } from "@/types/tutorial-content";
import type { SuccessPredicate, TutorialUnit } from "@/types/tutorial-content";

/**
 * The reveal predicate behind the step's progressive disclosure: the panel holds
 * the embedded check and the note box back until this says the participant has
 * done the step's action.
 *
 * Pinned here rather than read out of the panel's JSX because it has a trap in
 * it (the `successPredicate` case at the bottom of this file), and because
 * getting it wrong in either direction is silent: too strict and a participant
 * is never shown anywhere to answer, too loose and the reveal does nothing.
 */

const unit = (
    on: "run" | "patch" | "manual",
    successPredicate?: SuccessPredicate,
): TutorialUnit => ({
    id: `u-${on}`,
    kind: on === "patch" ? "patch" : on === "manual" ? "explore" : "lens",
    title: "Unit",
    task: "task",
    concept: "concept",
    prompts: [],
    hints: [],
    observationPrompt: "What did you notice?",
    progression: successPredicate ? { on, successPredicate } : { on },
});

const run = (topToken: string, secondToken: string | null = null) => ({ topToken, secondToken });

describe("hasDoneUnitAction", () => {
    it("waits for a run on a run-gated step", () => {
        const u = unit("run");
        expect(hasDoneUnitAction(u, undefined, null)).toBe(false);
        expect(hasDoneUnitAction(u, run("Paris", " the"), null)).toBe(true);
    });

    it("ignores a patch on a run-gated step", () => {
        // The progression says what this step's action is; a token filed by some
        // other interaction is not it.
        expect(hasDoneUnitAction(unit("run"), undefined, "Paris")).toBe(false);
    });

    it("waits for the patch on a patch-gated step", () => {
        const u = unit("patch");
        expect(hasDoneUnitAction(u, undefined, null)).toBe(false);
        // A lens run on the patch step is a prerequisite, not the step's action —
        // the participant still has to perform the drag.
        expect(hasDoneUnitAction(u, run("Rome"), null)).toBe(false);
        expect(hasDoneUnitAction(u, run("Rome"), "Paris")).toBe(true);
    });

    it("reveals a manual step immediately", () => {
        // Explore and the final challenge have no action to wait for, and their
        // note submission is what completes them: gating the box would deadlock
        // the step.
        expect(hasDoneUnitAction(unit("manual"), undefined, null)).toBe(true);
        expect(hasDoneUnitAction(unit("manual"), run("Paris"), "Paris")).toBe(true);
    });

    it("reveals a run that FAILS the step's success predicate", () => {
        // The trap. `u3-patterns` ships `topTokenNotEqual: "10"` — "make the model
        // get 5+5 wrong" — and a participant whose model answers 10 has still run
        // the prompt and still has something to report. If the reveal required the
        // predicate to pass, they would be shown neither the check nor the note
        // box, on the one step most likely to produce a surprising result. The
        // predicate governs step COMPLETION; this governs what is on screen.
        const u = unit("run", { kind: "topTokenNotEqual", value: "10" });
        expect(hasDoneUnitAction(u, run("10"), null)).toBe(true);
        expect(hasDoneUnitAction(u, run("11"), null)).toBe(true);
        // And it is still the run that does it, not the predicate being present.
        expect(hasDoneUnitAction(u, undefined, null)).toBe(false);
    });
});
