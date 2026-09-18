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

    // Validation rejects an out-of-range correctIndex, so this can only come from a
    // row authored before that guard. Scoring against a key that isn't there would
    // mark every answer wrong and log a check_answered nobody could have got right.
    it("closes a choice check whose answer key doesn't resolve", () => {
        const outOfRange = unit({
            question: "?",
            kind: "choice",
            options: ["Paris", "Rome"],
            correctIndex: 7,
        });
        expect(resolveCheckKey(outOfRange, undefined, null)).toEqual({
            expected: null,
            canAnswer: false,
        });

        const noOptions = unit({
            question: "?",
            kind: "choice",
            options: undefined as never,
            correctIndex: 0,
        });
        expect(resolveCheckKey(noOptions, undefined, null)).toEqual({
            expected: null,
            canAnswer: false,
        });
    });

    // Same "no key, no question" rule, for the index shapes the out-of-range
    // case above doesn't reach. All of these index off the end of the array and
    // so resolve to no key at all — which is what keeps the check closed rather
    // than open and ungradable. Now that verdicts can be on, an open check with
    // no key would tell the participant they were wrong.
    it("closes a choice check whose correctIndex isn't a position in the options", () => {
        const withIndex = (correctIndex: number) =>
            resolveCheckKey(
                unit({ question: "?", kind: "choice", options: ["Paris", "Rome"], correctIndex }),
                undefined,
                null,
            );
        expect(withIndex(-1)).toEqual({ expected: null, canAnswer: false });
        expect(withIndex(0.5)).toEqual({ expected: null, canAnswer: false });
        expect(withIndex(2)).toEqual({ expected: null, canAnswer: false });
        expect(withIndex(Number.NaN)).toEqual({ expected: null, canAnswer: false });
        // …and the in-range neighbours still answer.
        expect(withIndex(0)).toEqual({ expected: "Paris", canAnswer: true });
        expect(withIndex(1)).toEqual({ expected: "Rome", canAnswer: true });
    });

    // Pinned, not endorsed: an empty-string option resolves to a key, because
    // the guard is `key != null` and "" isn't nullish. The check opens with a
    // blank answer key. `validateTutorialContent` is what keeps this content out
    // of the DB (it requires non-empty option text); nothing in the key
    // derivation would.
    it("treats an empty option as a real (blank) answer key", () => {
        const blankOption = unit({
            question: "?",
            kind: "choice",
            options: ["", "Rome"],
            correctIndex: 0,
        });
        expect(resolveCheckKey(blankOption, undefined, null)).toEqual({
            expected: "",
            canAnswer: true,
        });
    });

    // The key and what the participant is told about it are separate concerns —
    // `resolveCheckFeedback` owns the second one. A check that opts out of a
    // verdict is still scored, still persisted, still emitted.
    it("derives the same key whatever feedback the check asks for", () => {
        const base = { question: "?", kind: "choice" as const, options: ["Paris", "Rome"] };
        for (const feedback of [undefined, "neutral", "verdict"] as const) {
            expect(
                resolveCheckKey(unit({ ...base, correctIndex: 1, feedback }), undefined, null),
            ).toEqual({ expected: "Rome", canAnswer: true });
        }
    });
});
