import { describe, it, expect } from "bun:test";

import { PROLIFIC_TUTORIAL_SEED } from "@/tutorials/prolificSeed";
import { TUTORIAL_STEP_ORDER, TUTORIAL_STEP_LABELS } from "@/tutorials/prolificSteps";
import { evalSuccessPredicate, resolveCheckFeedback } from "@/types/tutorial-content";
import { validateTutorialContent } from "@/lib/queries/tutorialContentDb";
import { promptsForUnitEntry } from "@/tutorials/unitPrompts";

const unit = (id: string) => PROLIFIC_TUTORIAL_SEED.units.find((u) => u.id === id)!;
const indexOf = (id: string) => PROLIFIC_TUTORIAL_SEED.units.findIndex((u) => u.id === id);
const U3_IDX = indexOf("u3-patterns");

/**
 * Units whose check is a `choice`. Each asks what something *means*, so the key
 * holds whatever the model predicts on the day. A question about what the model
 * actually produced must be run-scored instead.
 */
const CONCEPTUAL_CHOICE_UNITS = ["u0b-append", "u1-answers", "u1b-inside", "u2-knows"];

describe("prolific tutorial seed", () => {
    it("has the 10 canonical units in flow order", () => {
        expect(PROLIFIC_TUTORIAL_SEED.units.length).toBe(10);
        expect(PROLIFIC_TUTORIAL_SEED.units.map((u) => u.id)).toEqual([...TUTORIAL_STEP_ORDER]);
    });

    it("passes content validation", () => {
        expect(() => validateTutorialContent(PROLIFIC_TUTORIAL_SEED)).not.toThrow();
    });

    // prolificSteps.ts calls itself the seed's vocabulary; a label that no longer
    // matches its unit is a silently wrong axis label in the analytics funnel
    // whenever a tutorial row is missing.
    it("the step-id label fallbacks match the units they name", () => {
        for (const u of PROLIFIC_TUTORIAL_SEED.units) {
            expect(TUTORIAL_STEP_LABELS[u.id as keyof typeof TUTORIAL_STEP_LABELS]).toBe(u.title);
        }
    });

    it("every unit carries a task, concept, why, and progression", () => {
        for (const u of PROLIFIC_TUTORIAL_SEED.units) {
            expect(u.task.length).toBeGreaterThan(0);
            expect(u.concept.length).toBeGreaterThan(0);
            // `why` is optional in the type (older rows predate it) but the seed is
            // the reference content, and "what am I learning this for?" was the
            // pilot's most common unanswered question.
            expect(u.why?.length ?? 0).toBeGreaterThan(0);
            expect(["run", "patch", "manual"]).toContain(u.progression.on);
        }
    });

    it("opens with a welcome slideshow that carries the vocabulary", () => {
        const welcome = PROLIFIC_TUTORIAL_SEED.welcome!;
        expect(welcome.slides.length).toBeGreaterThan(1);
        // At least one slide is the vocabulary card deck — the orientation exists
        // because "I needed to learn a lot of things before I could get going" was
        // the arm's worst-scoring SUS item.
        const cards = welcome.slides.flatMap((s) => s.cards ?? []);
        expect(cards.length).toBeGreaterThanOrEqual(4);
        for (const term of ["Token", "Layer", "Cell"]) {
            expect(cards.map((c) => c.term)).toContain(term);
        }
    });

    // The slideshow states the step count in prose, so it can silently contradict
    // the content the moment a unit is added — which it did, the first time one was.
    it("the welcome slideshow's step count matches the units", () => {
        const spelled = [
            "zero",
            "one",
            "two",
            "three",
            "four",
            "five",
            "six",
            "seven",
            "eight",
            "nine",
            "ten",
            "eleven",
            "twelve",
        ][PROLIFIC_TUTORIAL_SEED.units.length];
        const bodies = PROLIFIC_TUTORIAL_SEED.welcome!.slides.map((s) => s.body ?? "").join(" ");
        expect(bodies.toLowerCase()).toContain(`${spelled} short steps`);
    });

    // The grid-reading step has to come before the step that asks them to choose a
    // cell to patch; otherwise "why there?" has nothing to stand on.
    it("teaches how a prediction is made before asking for an intervention", () => {
        expect(indexOf("u1b-inside")).toBeLessThan(indexOf("u4a-compare"));
        expect(indexOf("u1b-inside")).toBeLessThan(indexOf("u4-patching"));
        // It rings a mid-grid cell: auto-fit can downsample middle layers away, so
        // "click a middle cell" isn't reliably possible without one.
        const cells = unit("u1b-inside").spotlights ?? [];
        expect(cells.length).toBe(1);
        expect(cells[0].layer).not.toBe("last");
        expect(cells[0].position).not.toBe("last");
    });

    // The bank is the frictionless route to the end; every step that can invite a
    // prompt of their own should. The two free-form steps already are that invitation.
    it("nudges a prompt of their own on every guided step", () => {
        for (const u of PROLIFIC_TUTORIAL_SEED.units) {
            if (u.progression.on === "manual") continue;
            expect(u.tryYourOwn?.length ?? 0).toBeGreaterThan(0);
        }
    });

    it("the patch unit preloads a source/target pair and completes on patch", () => {
        const patch = unit("u4-patching");
        expect(patch.patchPair).toBeDefined();
        expect(patch.progression.on).toBe("patch");
    });

    // The compare step is the gentler ramp into the worst-completing unit: it runs
    // the same pair but finishes on a run, so no drag is required to move on.
    it("the compare step runs the same pair without requiring a drag", () => {
        const compare = unit("u4a-compare");
        expect(compare.patchPair).toEqual(unit("u4-patching").patchPair!);
        expect(compare.progression.on).toBe("run");
        // No check: it asks the participant to read two heatmaps at once, so there
        // is no single token to score against, and the multiple-choice version
        // named both cities in one option — a static assertion about what the
        // model predicts, which can contradict the grids in front of them.
        expect(compare.check).toBeUndefined();
    });

    // The task text says "two cells are ringed for you", so they have to be ringed
    // on arrival — not only once a hint is revealed. The ring is also what forces
    // the widget to render that layer when a narrow column downsamples layers.
    it("the patch step rings both ends of the drag on arrival", () => {
        const cells = unit("u4-patching").spotlights ?? [];
        expect(cells.map((c) => c.grid).sort()).toEqual(["source", "target"]);
        // And the compare step deliberately does NOT: finding those rows is its task.
        expect(unit("u4a-compare").spotlights).toBeUndefined();
    });

    // The two halves of what a spotlight does, split. The compare step needs layer
    // 20 rendered — auto-fit drops it from two heatmaps in one column, and then the
    // column the next step drags across only appears once a hint rings it — but it
    // must not ring anything, because finding those rows is the step's own task.
    it("the compare step shows the patch layer without ringing its cells", () => {
        const compare = unit("u4a-compare");
        const forced = compare.forceLayers ?? [];
        expect(forced.map((f) => f.grid).sort()).toEqual(["source", "target"]);
        // Position-less, or it would ring a cell like any other spotlight.
        expect(forced.every((f) => !("position" in f))).toBe(true);
        // The same layer the next step drags across, so the participant has already
        // looked at the column they are about to patch.
        const patched = unit("u4-patching").spotlights ?? [];
        expect(forced.map((f) => f.layer)).toEqual(patched.map((c) => c.layer));
    });

    // Every hint that names a cell in prose also rings it. A hint that has to give
    // coordinates ("the 'um' cell at the end of 'Colosseum'") is a hint about a
    // missing affordance, and the drag is the one interaction prose can't convey.
    it("the patch step spotlights both ends of the drag on every rung", () => {
        for (const h of unit("u4-patching").hints) {
            const cells = h.spotlights ?? (h.spotlight ? [h.spotlight] : []);
            expect(cells.map((c) => c.grid).sort()).toEqual(["source", "target"]);
        }
    });

    it("unit 3 starts from the bare sum, so the before-picture isn't skipped", () => {
        const patterns = unit("u3-patterns");
        // Clicking a bank prompt fills AND runs it, so the first entry is what a
        // participant sees first. It used to be the already-poisoned prompt, which
        // meant the one click that set the step up also skipped its point.
        expect(patterns.prompts[0]).toBe("5+5=");
        expect(patterns.prompts.slice(1).every((p) => p.includes("\n"))).toBe(true);
        // And arriving at the step restores that bare sum, not a poisoned prompt.
        expect(
            promptsForUnitEntry(PROLIFIC_TUTORIAL_SEED.units, U3_IDX, { source: "", target: "" }),
        ).toEqual({ source: "5+5=" });
    });

    it("unit 3 completes only when the sum is coaxed off 10", () => {
        const pred = unit("u3-patterns").progression.successPredicate;
        expect(evalSuccessPredicate(pred, "10")).toBe(false);
        expect(evalSuccessPredicate(pred, " 10")).toBe(false); // leading-space token
        expect(evalSuccessPredicate(pred, " 11")).toBe(true);
        expect(evalSuccessPredicate(pred, "9")).toBe(true);
        expect(evalSuccessPredicate(pred, null)).toBe(false);
    });

    // The append step's own bank must hold the prompt it starts FROM, not the
    // appended result: the restore replaces another step's prompt on arrival, so an
    // appended bank entry would perform the step's task before it had been read.
    it("the append step's bank holds the pre-append prompt", () => {
        const append = unit("u0b-append");
        expect(append.prompts).toEqual(unit("u0-orientation").prompts);
        const showMe = append.hints.find((h) => h.insertPrompt);
        expect(showMe!.insertPrompt!.startsWith(append.prompts[0])).toBe(true);
        expect(showMe!.insertPrompt).not.toBe(append.prompts[0]);
    });

    it("an `always` predicate succeeds on any completed run", () => {
        expect(evalSuccessPredicate({ kind: "always" }, "anything")).toBe(true);
        expect(evalSuccessPredicate(undefined, "anything")).toBe(true);
    });

    // This used to assert the opposite — the seed stayed neutral because it was a
    // live Prolific instrument and engagement was a covariate. It is no longer
    // fielded: it is the demo row and the in-code fallback, so it is what anyone
    // testing or demoing the tutorial sees, and a check that only says "thanks"
    // can't be exercised without a live model. Every check is now statically
    // keyed (see the invariant below), so the verdict it shows is trustworthy.
    it("shows a verdict on its checks", () => {
        expect(PROLIFIC_TUTORIAL_SEED.checkFeedback).toBe("verdict");
        // No per-check overrides, so the tutorial-level default governs all of
        // them and there is one place to look when the behaviour is questioned.
        expect(PROLIFIC_TUTORIAL_SEED.units.every((u) => u.check?.feedback == null)).toBe(true);
    });

    // The same invariant `cs1720Content.test.ts` enforces on the authored
    // classroom JSON (memo SF-7), now that this content resolves to a verdict
    // too. A free-text check scored against a live model token, shown as
    // right/wrong, is the configuration that graded the best pilot participant
    // 1-of-5.
    it("never freezes a model output into a static answer key", () => {
        // The guard that would have caught `u4-patching`. A verdict is only
        // honest when its key cannot disagree with the participant's grid: either
        // a `choice` about what something *means*, or a run-scored key read off
        // their own run. "The target now says Paris" is neither — it is a claim
        // about a run, frozen into content, and it marked a correct reading of an
        // unpatched target wrong.
        //
        // Mirrored for the classroom JSON in `cs1720Content.test.ts` under the
        // same name. Change one, change the other.
        const verdicted = PROLIFIC_TUTORIAL_SEED.units.filter(
            (u) =>
                u.check &&
                resolveCheckFeedback(u.check, PROLIFIC_TUTORIAL_SEED.checkFeedback) === "verdict",
        );
        expect(verdicted.length).toBe(7);
        for (const u of verdicted) {
            const kind = u.check!.kind;
            if (kind === "choice") {
                expect(CONCEPTUAL_CHOICE_UNITS).toContain(u.id);
            } else {
                expect(["topToken", "secondToken"]).toContain(kind);
            }
        }
    });

    it("keeps the patch step's check gated behind the patch", () => {
        // `resolveCheckKey` keys a patch unit's run-scored check to `patchToken`,
        // null until the drag lands. That gate is the only thing stopping a
        // participant answering about a patch they have not made — a `choice`
        // check here is answerable on arrival.
        for (const u of PROLIFIC_TUTORIAL_SEED.units) {
            if (u.progression.on !== "patch" || !u.check) continue;
            expect(["topToken", "secondToken"]).toContain(u.check.kind);
        }
    });

    it("gives every choice check distinct options and a key inside them", () => {
        for (const u of PROLIFIC_TUTORIAL_SEED.units) {
            if (u.check?.kind !== "choice") continue;
            const check = u.check;
            expect(check.options.length).toBeGreaterThanOrEqual(2);
            // A duplicated option means two clickable answers, one of which is
            // marked wrong for saying the same thing as the right one.
            expect(new Set(check.options).size).toBe(check.options.length);
            expect(check.options.every((o) => o.trim().length > 0)).toBe(true);
            expect(Number.isInteger(check.correctIndex)).toBe(true);
            expect(check.correctIndex).toBeGreaterThanOrEqual(0);
            expect(check.correctIndex).toBeLessThan(check.options.length);
        }
    });

    // Keys spread across positions, matching the classroom JSON. All-zero keys
    // let a participant score full marks by always clicking the first option,
    // which measures nothing.
    it("does not put every answer key in the same position", () => {
        const keys = PROLIFIC_TUTORIAL_SEED.units
            .map((u) => (u.check?.kind === "choice" ? u.check.correctIndex : null))
            .filter((k): k is number => k !== null);
        expect(new Set(keys).size).toBeGreaterThan(1);
    });

    it("carries answerPlaceholder on exactly the checks that render an input", () => {
        // It labels the typed-answer input, which only a run-scored check renders.
        // Dead content on a choice unit; a missing label on a run-scored one.
        for (const u of PROLIFIC_TUTORIAL_SEED.units) {
            const kind = u.check?.kind;
            if (kind === "topToken" || kind === "secondToken") {
                expect(typeof u.answerPlaceholder).toBe("string");
            } else {
                expect(u.answerPlaceholder).toBeUndefined();
            }
        }
    });
});
