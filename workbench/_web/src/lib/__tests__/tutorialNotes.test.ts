import { describe, it, expect } from "bun:test";

import { orderNotesByUnits } from "@/lib/tutorialNotes";
import type { TutorialNote } from "@/types/tutorialEvents";
import type { TutorialUnit } from "@/types/tutorial-content";

/**
 * The client-side join between a participant's saved notes and the tutorial's
 * units. Pure, so the ordering rules — including what happens to a note whose
 * unit has since been renamed or removed — are testable without a DB or a DOM.
 */

const unit = (id: string, title: string): TutorialUnit => ({
    id,
    kind: "lens",
    title,
    task: "task",
    concept: "concept",
    prompts: [],
    hints: [],
    observationPrompt: "What did you notice?",
    progression: { on: "run" },
});

const units: TutorialUnit[] = [
    unit("u0", "First look"),
    unit("u1", "Ranked answers"),
    unit("u2", "What it knows"),
];

const note = (stepId: string, text: string, at: number): TutorialNote => ({
    stepId,
    text,
    createdAt: new Date(at),
});

describe("orderNotesByUnits", () => {
    it("sorts notes into unit order and labels them with the unit", () => {
        // The read path returns notes in the order the steps were first written
        // about, which is not tutorial order for a participant who walked back.
        const ordered = orderNotesByUnits(
            [note("u2", "third step", 3000), note("u0", "first step", 1000)],
            units,
        );
        expect(ordered.map((n) => n.stepId)).toEqual(["u0", "u2"]);
        expect(ordered.map((n) => n.stepNumber)).toEqual([1, 3]);
        expect(ordered.map((n) => n.stepTitle)).toEqual(["First look", "What it knows"]);
        expect(ordered.map((n) => n.text)).toEqual(["first step", "third step"]);
    });

    it("keeps a note whose unit is gone, with its raw id, at the end", () => {
        // Content is DB-driven and editable between sessions. The participant
        // wrote this; a list that quietly loses entries is worse than one with an
        // unhelpful heading.
        const ordered = orderNotesByUnits(
            [note("u-removed", "orphan", 5000), note("u1", "middle", 1000)],
            units,
        );
        expect(ordered.map((n) => n.stepId)).toEqual(["u1", "u-removed"]);
        expect(ordered[1].stepTitle).toBe("u-removed");
        expect(ordered[1].stepNumber).toBeNull();
        expect(ordered[0].stepNumber).toBe(2);
    });

    it("preserves write order among several unknown ids", () => {
        // They all rank equal-last, so the createdAt tiebreak is the only thing
        // keeping them in a stable, meaningful order.
        const ordered = orderNotesByUnits(
            [
                note("gone-b", "later", 9000),
                note("u0", "known", 1000),
                note("gone-a", "earlier", 2000),
            ],
            units,
        );
        expect(ordered.map((n) => n.stepId)).toEqual(["u0", "gone-a", "gone-b"]);
        expect(ordered.map((n) => n.text)).toEqual(["known", "earlier", "later"]);
    });

    it("renders every note with its raw id when the content hasn't loaded yet", () => {
        // `units` is empty on first paint (the tutorial row is a separate query),
        // and the notes query can resolve first. Dropping notes there would show
        // an empty popover to a participant who has written several.
        const notes = [note("u1", "b", 2000), note("u0", "a", 1000)];
        const ordered = orderNotesByUnits(notes, []);
        expect(ordered).toHaveLength(2);
        expect(ordered.map((n) => n.stepTitle)).toEqual(["u0", "u1"]);
        expect(ordered.every((n) => n.stepNumber === null)).toBe(true);
    });

    it("has nothing to say about no notes", () => {
        expect(orderNotesByUnits([], units)).toEqual([]);
    });
});
