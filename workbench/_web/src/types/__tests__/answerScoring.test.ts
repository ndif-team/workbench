import { describe, it, expect } from "bun:test";

import { normalizeAnswer, resolveCheckFeedback } from "@/types/tutorial-content";
import type { CheckFeedback, UnitCheck } from "@/types/tutorial-content";

/**
 * The two pure functions a check's outcome depends on: how an answer is folded
 * before it is compared to the key, and whether the participant is told the
 * result. Both were inline in the panel before this wave — the fold as a local
 * `norm()` whose own comment overstated what it strips, the feedback gate as a
 * single hard-coded line.
 */

const check = (overrides: Partial<UnitCheck> = {}): UnitCheck =>
    ({
        question: "What did the model predict?",
        kind: "topToken",
        ...overrides,
    }) as UnitCheck;

describe("normalizeAnswer", () => {
    // Everything the fold is *for*: the participant types "Paris" and the key is
    // whatever leading space marker the heatmap happened to render.
    it("folds case, surrounding whitespace and a leading space marker together", () => {
        const key = normalizeAnswer("Paris");
        expect(key).toBe("paris");
        for (const typed of [
            "Paris",
            "paris",
            " Paris",
            "▁Paris",
            "␣Paris",
            "_Paris",
            "  paris  ",
            "  ▁ ␣_Paris",
        ]) {
            expect(normalizeAnswer(typed)).toBe(key);
        }
    });

    it("folds every empty-ish input to the empty string", () => {
        expect(normalizeAnswer(null)).toBe("");
        expect(normalizeAnswer(undefined)).toBe("");
        expect(normalizeAnswer("")).toBe("");
        expect(normalizeAnswer("   ")).toBe("");
    });

    // The negative cases are the point. The strip regex is `^`-anchored
    // (`/^[▁␣_\s]+/`), so it removes *leading* markers and nothing else —
    // internal whitespace, trailing punctuation and a trailing marker all
    // survive the fold and will read as a wrong answer. Anyone reasoning from
    // the old "and whitespace" comment would expect the opposite.
    it("leaves internal whitespace alone — the strip is leading-anchored", () => {
        expect(normalizeAnswer("New York")).toBe("new york");
        expect(normalizeAnswer("New York")).not.toBe(normalizeAnswer("newyork"));
        expect(normalizeAnswer("Par is")).not.toBe(normalizeAnswer("Paris"));
    });

    it("leaves trailing punctuation and a trailing marker alone", () => {
        expect(normalizeAnswer("Paris.")).toBe("paris.");
        expect(normalizeAnswer("Paris.")).not.toBe(normalizeAnswer("Paris"));
        expect(normalizeAnswer("Paris▁")).not.toBe(normalizeAnswer("Paris"));
        expect(normalizeAnswer("Paris␣")).not.toBe(normalizeAnswer("Paris"));
    });

    // Pinning the consequence rather than endorsing it: a blank answer folds
    // equal to a blank key, so comparing the two folds alone would score an
    // empty submission as correct. The only thing preventing that today is
    // `submitTyped`'s `!value.trim()` early return in TutorialActivityPanel —
    // there is no guard inside the fold itself.
    it("folds a blank answer equal to a blank key", () => {
        expect(normalizeAnswer("   ")).toBe(normalizeAnswer(null));
    });
});

describe("resolveCheckFeedback", () => {
    it("says neutral when there is no check to speak of", () => {
        // Guards the call site: the panel resolves feedback before it knows
        // whether the unit has a check at all.
        expect(resolveCheckFeedback(undefined, undefined)).toBe("neutral");
    });

    it("says neutral when neither the check nor the tutorial asks for anything", () => {
        // The Prolific no-behaviour-change guarantee: content authored before
        // either field existed resolves exactly as it did before they arrived.
        expect(resolveCheckFeedback(check(), undefined)).toBe("neutral");
    });

    it("inherits the tutorial's default when the check is silent", () => {
        // The classroom case — one line in the JSON verdicts every check, so a
        // session cannot ship half-verdicted because a rewrite missed one.
        expect(resolveCheckFeedback(check(), "verdict")).toBe("verdict");
    });

    it("lets a check opt out of a verdict tutorial", () => {
        // The ambiguous-check escape hatch: a runner-up that moves between runs
        // stays quiet without giving up verdicts on the checks whose keys are
        // exact.
        expect(resolveCheckFeedback(check({ feedback: "neutral" }), "verdict")).toBe("neutral");
    });

    it("keeps the pre-existing per-check opt-in working", () => {
        // How a verdict was requested before the tutorial-level field existed;
        // it still wins over both an absent and an explicit neutral default.
        expect(resolveCheckFeedback(check({ feedback: "verdict" }), undefined)).toBe("verdict");
        expect(resolveCheckFeedback(check({ feedback: "verdict" }), "neutral")).toBe("verdict");
    });

    it("resolves to one of the two supported values for every combination", () => {
        // Nothing in the table can produce a third value the panel's
        // `feedback === "verdict"` gate would silently read as neutral.
        const values: (CheckFeedback | undefined)[] = [undefined, "neutral", "verdict"];
        for (const tutorialDefault of values) {
            for (const own of values) {
                const resolved = resolveCheckFeedback(check({ feedback: own }), tutorialDefault);
                expect(["verdict", "neutral"]).toContain(resolved);
            }
        }
    });
});
