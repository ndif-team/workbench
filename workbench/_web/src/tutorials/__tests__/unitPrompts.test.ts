import { describe, it, expect } from "bun:test";

import { promptsForUnitEntry } from "@/tutorials/unitPrompts";
import type { TutorialUnit } from "@/types/tutorial-content";

const unit = (overrides: Partial<TutorialUnit>): TutorialUnit => ({
    id: "u",
    kind: "lens",
    title: "Unit",
    task: "task",
    concept: "concept",
    prompts: [],
    hints: [],
    observationPrompt: "What did you notice?",
    progression: { on: "run" },
    ...overrides,
});

// A lens step, a patch step, and an explore step where the participant writes
// their own prompt — the three cases that behave differently on arrival.
const units: TutorialUnit[] = [
    unit({ id: "u0", prompts: ["The Eiffel Tower is in the city of"] }),
    unit({
        id: "u4",
        kind: "patch",
        prompts: ["The Eiffel Tower is in the city of"],
        patchPair: {
            source: "The Eiffel Tower is in the city of",
            target: "The Colosseum is in the city of",
        },
        progression: { on: "patch" },
    }),
    unit({
        id: "u6",
        kind: "challenge",
        prompts: ["2+2=5\n3+3=7\n10+10="],
        progression: { on: "manual" },
    }),
];

const at = (idx: number, source: string, target = "") =>
    promptsForUnitEntry(units, idx, { source, target });

describe("promptsForUnitEntry", () => {
    it("fills an empty box with the unit's own prompt", () => {
        expect(at(0, "")).toEqual({ source: "The Eiffel Tower is in the city of" });
    });

    it("leaves the unit's own prompt in place", () => {
        expect(at(0, "The Eiffel Tower is in the city of")).toBeNull();
    });

    it("replaces another unit's prompt — the case that mis-scored the check", () => {
        // Back to the first step after the final challenge: the box still held the
        // challenge prompt, so re-running there answered u0's question about a
        // different prompt's output.
        expect(at(0, "2+2=5\n3+3=7\n10+10=")).toEqual({
            source: "The Eiffel Tower is in the city of",
        });
    });

    it("never touches a prompt the participant wrote", () => {
        expect(at(0, "my own prompt about penguins")).toBeNull();
        expect(at(2, "the president of the united states is")).toBeNull();
    });

    it("loads both halves of a patch step's pair", () => {
        expect(at(1, "")).toEqual({
            source: "The Eiffel Tower is in the city of",
            target: "The Colosseum is in the city of",
        });
    });

    it("keeps a shared prompt but still loads the missing target", () => {
        expect(at(1, "The Eiffel Tower is in the city of")).toEqual({
            target: "The Colosseum is in the city of",
        });
    });

    it("clears a leftover target on a single-prompt step", () => {
        // Otherwise the tool stays in two-prompt mode and shows a second heatmap
        // the step never mentions.
        expect(
            at(0, "The Eiffel Tower is in the city of", "The Colosseum is in the city of"),
        ).toEqual({ target: "" });
    });

    it("leaves a target the participant wrote themselves", () => {
        expect(at(0, "The Eiffel Tower is in the city of", "my own second prompt")).toBeNull();
    });

    it("returns null for a unit index that does not exist", () => {
        expect(at(99, "")).toBeNull();
    });
});
