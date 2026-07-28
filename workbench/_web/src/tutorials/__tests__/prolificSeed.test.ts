import { describe, it, expect } from "bun:test";

import { PROLIFIC_TUTORIAL_SEED } from "@/tutorials/prolificSeed";
import { TUTORIAL_STEP_ORDER } from "@/tutorials/prolificSteps";
import { evalSuccessPredicate } from "@/types/tutorial-content";
import { validateTutorialContent } from "@/lib/queries/tutorialContentDb";

describe("prolific tutorial seed", () => {
    it("has the 7 canonical units in flow order", () => {
        expect(PROLIFIC_TUTORIAL_SEED.units.length).toBe(7);
        expect(PROLIFIC_TUTORIAL_SEED.units.map((u) => u.id)).toEqual([...TUTORIAL_STEP_ORDER]);
    });

    it("passes content validation", () => {
        expect(() => validateTutorialContent(PROLIFIC_TUTORIAL_SEED)).not.toThrow();
    });

    it("every unit carries a task, concept, and progression", () => {
        for (const u of PROLIFIC_TUTORIAL_SEED.units) {
            expect(u.task.length).toBeGreaterThan(0);
            expect(u.concept.length).toBeGreaterThan(0);
            expect(["run", "patch", "manual"]).toContain(u.progression.on);
        }
    });

    it("the patch unit preloads a source/target pair and completes on patch", () => {
        const patch = PROLIFIC_TUTORIAL_SEED.units.find((u) => u.kind === "patch")!;
        expect(patch.patchPair).toBeDefined();
        expect(patch.progression.on).toBe("patch");
    });

    it("unit 3 completes only when the sum is coaxed off 10", () => {
        const pred = PROLIFIC_TUTORIAL_SEED.units.find((u) => u.id === "u3-patterns")!.progression
            .successPredicate;
        expect(evalSuccessPredicate(pred, "10")).toBe(false);
        expect(evalSuccessPredicate(pred, " 10")).toBe(false); // leading-space token
        expect(evalSuccessPredicate(pred, " 11")).toBe(true);
        expect(evalSuccessPredicate(pred, "9")).toBe(true);
        expect(evalSuccessPredicate(pred, null)).toBe(false);
    });

    it("an `always` predicate succeeds on any completed run", () => {
        expect(evalSuccessPredicate({ kind: "always" }, "anything")).toBe(true);
        expect(evalSuccessPredicate(undefined, "anything")).toBe(true);
    });
});
