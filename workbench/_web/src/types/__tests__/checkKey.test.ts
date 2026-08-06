import { describe, it, expect } from "bun:test";

import { resolveCheckKey } from "@/types/tutorial-content";
import type { TutorialUnit, UnitCheck } from "@/types/tutorial-content";

/**
 * The panel's answer-key derivation. This is where the mis-scoring bug lived, so
 * it is a pure function rather than three ternaries inside a component.
 */

const unit = (
    check: UnitCheck | undefined,
    on: "run" | "patch" | "manual" = "run",
): TutorialUnit => ({
    id: "u",
    kind: on === "patch" ? "patch" : "lens",
    title: "Unit",
    task: "task",
    concept: "concept",
    prompts: [],
    hints: [],
    observationPrompt: "What did you notice?",
    check,
    progression: { on },
});

const run = (topToken: string, secondToken: string | null = null) => ({ topToken, secondToken });

describe("resolveCheckKey", () => {
    it("has nothing to ask when the unit carries no check", () => {
        expect(resolveCheckKey(unit(undefined), run("Paris"), null)).toEqual({
            expected: null,
            canAnswer: false,
        });
    });

    it("keeps a check closed until this unit has a run", () => {
        const u = unit({ question: "?", kind: "topToken" });
        expect(resolveCheckKey(u, undefined, null)).toEqual({ expected: null, canAnswer: false });
        expect(resolveCheckKey(u, run("Paris"), null)).toEqual({
            expected: "Paris",
            canAnswer: true,
        });
    });

    it("scores a patch unit against the patch outcome, not the source's prediction", () => {
        const u = unit({ question: "?", kind: "topToken" }, "patch");
        // A lens run on the patch step is a prerequisite; its top token is the
        // source's own answer and would mark the right answer wrong.
        expect(resolveCheckKey(u, run("Rome"), null)).toEqual({
            expected: null,
            canAnswer: false,
        });
        expect(resolveCheckKey(u, run("Rome"), "Paris")).toEqual({
            expected: "Paris",
            canAnswer: true,
        });
    });

    it("asks the run for a runner-up even on a patch unit", () => {
        // Kind wins over progression: a secondToken check is about the run either way.
        const u = unit({ question: "?", kind: "secondToken" }, "patch");
        expect(resolveCheckKey(u, run("Paris", " London"), "Rome")).toEqual({
            expected: " London",
            canAnswer: true,
        });
    });

    it("stays closed when the run had no runner-up to name", () => {
        // top-k of one: there is no second token, so an answer could only be marked
        // wrong — and would log a check_answered nobody could have got right.
        const u = unit({ question: "?", kind: "secondToken" });
        expect(resolveCheckKey(u, run("Paris", null), null)).toEqual({
            expected: null,
            canAnswer: false,
        });
    });

    it("answers a choice check with no run at all", () => {
        const u = unit({
            question: "?",
            kind: "choice",
            options: ["Paris", "a newline"],
            correctIndex: 1,
        });
        expect(resolveCheckKey(u, undefined, null)).toEqual({
            expected: "a newline",
            canAnswer: true,
        });
    });
});
