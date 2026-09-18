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
 * The invariant that matters is `never freezes a model output into a static
 * answer key`. A verdict is only honest when its key cannot disagree with the
 * grid in front of the participant, and there are exactly two ways to get that:
 * a `choice` whose key is a statement about *meaning*, or a run-scored kind
 * whose key is read off their own run. Freezing "the target now says Paris"
 * into `options` satisfies neither — it is a claim about a run, and it marked a
 * correct reading of an unpatched target wrong.
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

/**
 * The units whose check is a `choice`. Every one asks what something *means* —
 * what a runner-up tells you, what the cone can reach — so the key holds
 * whatever the model on the day happens to predict. Anything asking what the
 * model actually produced must be run-scored instead; see the invariant below.
 */
const CONCEPTUAL_CHOICE_UNITS = ["u0b-append", "u1-answers", "u1b-inside", "u2-knows"];

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

    // The highest-value assertion in the suite, and the one that would have
    // caught the `u4-patching` bug: a verdicted `choice` may only be one of the
    // conceptual questions, because a static key is content, and content cannot
    // know what a given model on a given run produced.
    //
    // Both shipped contents carry this guard; the mirror for
    // `PROLIFIC_TUTORIAL_SEED` is the identically-named test in
    // `prolificSeed.test.ts`. Change one, change the other.
    it("never freezes a model output into a static answer key", () => {
        const content = load();
        const verdicted = content.units.filter(
            (u) => u.check && resolveCheckFeedback(u.check, content.checkFeedback) === "verdict",
        );
        // Not a vacuous pass.
        expect(verdicted.length).toBeGreaterThan(0);
        for (const u of verdicted) {
            const kind = u.check!.kind;
            if (kind === "choice") {
                // Adding a choice check here is a deliberate act: it must be a
                // question about meaning, not about what the model emitted.
                expect(CONCEPTUAL_CHOICE_UNITS).toContain(u.id);
            } else {
                // Run-scored: the key is the participant's own run, so it agrees
                // with their screen by construction and `resolveCheckKey` keeps
                // the check closed until that run exists.
                expect(["topToken", "secondToken"]).toContain(kind);
            }
        }
    });

    it("keeps the patch step's check gated behind the patch", () => {
        // `resolveCheckKey` keys a patch unit's run-scored check to `patchToken`,
        // which is null until the drag lands — that gate is the only thing
        // stopping a participant answering about a patch they have not made. A
        // `choice` check here is answerable immediately, which is how "Rome" (a
        // correct reading of an unpatched target) came back marked wrong.
        for (const u of load().units) {
            if (u.progression?.on !== "patch" || !u.check) continue;
            expect(["topToken", "secondToken"]).toContain(u.check.kind);
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

    it("carries answerPlaceholder on exactly the checks that render an input", () => {
        // It labels the typed-answer input, which only a run-scored check renders.
        // On a choice unit it is dead content that reads as an instruction; on a
        // run-scored one its absence leaves the input unlabelled.
        for (const u of load().units) {
            const kind = u.check?.kind;
            if (kind === "topToken" || kind === "secondToken") {
                expect(typeof u.answerPlaceholder).toBe("string");
            } else {
                expect(u.answerPlaceholder).toBeUndefined();
            }
        }
    });
});
