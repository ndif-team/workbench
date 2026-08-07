import { describe, it, expect } from "bun:test";

import { PROLIFIC_TUTORIAL_SEED } from "@/tutorials/prolificSeed";
import { TUTORIAL_STEP_ORDER, TUTORIAL_STEP_LABELS } from "@/tutorials/prolificSteps";
import { evalSuccessPredicate } from "@/types/tutorial-content";
import { validateTutorialContent } from "@/lib/queries/tutorialContentDb";
import { promptsForUnitEntry } from "@/tutorials/unitPrompts";

const unit = (id: string) => PROLIFIC_TUTORIAL_SEED.units.find((u) => u.id === id)!;
const indexOf = (id: string) => PROLIFIC_TUTORIAL_SEED.units.findIndex((u) => u.id === id);
const U3_IDX = indexOf("u3-patterns");

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
});
