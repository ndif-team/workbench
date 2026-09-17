import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { validateTutorialContent } from "@/lib/queries/tutorialContentDb";
import { resolveCheckFeedback } from "@/types/tutorial-content";
import type { TutorialContent } from "@/types/tutorial-content";

/**
 * A guard on the authored classroom content, which no other test covers: it is
 * pasted into /admin/tutorials by hand, so the only thing standing between a
 * typo and a room full of students is this file and the manual pre-flight.
 *
 * The invariant that matters is the last one (memo SF-7): a check that resolves
 * to a verdict must have a static answer key. A free-text check scored against a
 * live model token, shown as right/wrong, is the configuration that graded the
 * best pilot participant 1-of-5.
 */

// Authored content lives at the repo root by convention (alongside
// `tutorial.json`), which is five levels up from this file — bunfig.toml sets
// the test root to ./src, so it cannot be imported by module path.
const CONTENT_FILE = "tutorial-cs1720-2026-09-22.json";
const CONTENT_PATH = path.resolve(import.meta.dir, "../../../../..", CONTENT_FILE);

const load = (): TutorialContent => {
    if (!existsSync(CONTENT_PATH)) {
        throw new Error(
            `Classroom tutorial content not found at ${CONTENT_PATH}. ` +
                `${CONTENT_FILE} is the CS 1720 session content and must be committed to the ` +
                `repo root for this guard to run — if it was renamed, update CONTENT_FILE here.`,
        );
    }
    return JSON.parse(readFileSync(CONTENT_PATH, "utf8")) as TutorialContent;
};

describe("cs1720 classroom tutorial content", () => {
    it("is legal content the admin dialog would accept", () => {
        // Same validator the paste dialog runs, so a red test here means a red
        // save on the 21st.
        expect(() => validateTutorialContent(load())).not.toThrow();
    });

    it("turns verdicts on for the whole tutorial", () => {
        // The single line that separates this content from the Prolific arm.
        const content = load();
        expect(content.checkFeedback).toBe("verdict");
        expect(content.units.length).toBeGreaterThan(0);
    });

    // The highest-value assertion in the suite. It fails the moment a later
    // content edit gives a free-text check a verdict — whether by adding a
    // `topToken` check to this tutorial or by converting one of these back.
    //
    // Both shipped contents now resolve to a verdict, so both need this guard:
    // the mirror for `PROLIFIC_TUTORIAL_SEED` is the identically-named test in
    // `prolificSeed.test.ts`. Change one, change the other.
    it("shows a verdict only on checks with a static answer key", () => {
        const content = load();
        const verdicted = content.units.filter(
            (u) => u.check && resolveCheckFeedback(u.check, content.checkFeedback) === "verdict",
        );
        // Not a vacuous pass: the conversion exists to make these gradable.
        expect(verdicted.length).toBeGreaterThan(0);
        for (const u of verdicted) {
            expect(u.check!.kind).toBe("choice");
        }
    });

    it("gives every choice check at least two distinct options and a key inside them", () => {
        const content = load();
        const choices = content.units.filter((u) => u.check?.kind === "choice");
        expect(choices.length).toBeGreaterThan(0);
        for (const u of choices) {
            const check = u.check as Extract<typeof u.check, { kind: "choice" }>;
            expect(check.options.length).toBeGreaterThanOrEqual(2);
            // A duplicated option means two clickable answers, one of which is
            // marked wrong for saying the same thing as the right one.
            expect(new Set(check.options).size).toBe(check.options.length);
            expect(check.options.every((o) => typeof o === "string" && o.trim().length > 0)).toBe(
                true,
            );
            expect(Number.isInteger(check.correctIndex)).toBe(true);
            expect(check.correctIndex).toBeGreaterThanOrEqual(0);
            expect(check.correctIndex).toBeLessThan(check.options.length);
        }
    });

    it("has no leftover answerPlaceholder from the free-text checks", () => {
        // It only ever labelled the typed-answer input, which a choice check does
        // not render — a survivor is dead content that reads as an instruction.
        for (const u of load().units) {
            expect(u.answerPlaceholder).toBeUndefined();
        }
    });
});
