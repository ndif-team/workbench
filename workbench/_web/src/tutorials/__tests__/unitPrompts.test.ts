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

    it("leaves the box alone on a step whose task is to write your own prompt", () => {
        expect(at(2, "the president of the united states is")).toBeNull();
    });

    it("puts a guided step's own prompt back even over text the participant typed", () => {
        // The alternative is what caused the original mis-scoring: the step's
        // instructions and check describe one prompt while the box holds another.
        // Free writing belongs to the explore and challenge steps (above).
        expect(at(0, "my own prompt about penguins")).toEqual({
            source: "The Eiffel Tower is in the city of",
        });
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

    it("clears any target on a single-prompt step, typed or not", () => {
        // A leftover target keeps the tool in two-prompt mode, showing a second
        // heatmap the step never mentions.
        expect(at(0, "The Eiffel Tower is in the city of", "my own second prompt")).toEqual({
            target: "",
        });
        expect(at(2, "anything", "their own target")).toBeNull(); // …but not on a free step
    });

    it("corrects a patch step's own prompt sitting in the wrong box", () => {
        // The pair is authoritative on a patch step: its bank lists both halves, so
        // "owned by this unit" isn't enough to leave the target prompt in the source
        // box — the instructions describe dragging from one into the other.
        expect(at(1, "The Colosseum is in the city of")).toEqual({
            source: "The Eiffel Tower is in the city of",
            target: "The Colosseum is in the city of",
        });
    });

    it("returns null for a unit index that does not exist", () => {
        expect(at(99, "")).toBeNull();
    });

    it("does not throw on content that isn't strings", () => {
        // Runs inside an effect: a throw here takes the whole chart page, not just
        // the tutorial. Validation rejects such content, but older rows exist.
        const broken = [
            unit({ id: "b", prompts: [{ text: "hi" } as never] }),
            unit({
                id: "b2",
                patchPair: { source: 5 as never, target: null as never },
                prompts: undefined as never,
            }),
        ];
        expect(() =>
            promptsForUnitEntry(broken, 0, { source: "typed this", target: "" }),
        ).not.toThrow();
        expect(() => promptsForUnitEntry(broken, 1, { source: "", target: "" })).not.toThrow();
    });
});

// The shape of a full tutorial: an append step whose task is to extend the
// previous step's prompt, a compare step and a patch step sharing one pair, and
// free-writing steps at the end. Walking the real content through this by hand is
// what caught the append step arriving with its task already done.
const fullUnits: TutorialUnit[] = [
    unit({ id: "u0", prompts: ["The Eiffel Tower is in the city of"] }),
    unit({
        id: "u0b-append",
        prompts: [
            "The Eiffel Tower is in the city of Paris",
            "The Eiffel Tower is in the city of Paris, which is the capital of",
        ],
    }),
    unit({ id: "u1", prompts: ["The largest planet in the solar system is"] }),
    unit({
        id: "u4a-compare",
        prompts: ["The Eiffel Tower is in the city of", "The Colosseum is in the city of"],
        patchPair: {
            source: "The Eiffel Tower is in the city of",
            target: "The Colosseum is in the city of",
        },
    }),
    unit({
        id: "u4-patching",
        kind: "patch",
        prompts: ["The Eiffel Tower is in the city of", "The Colosseum is in the city of"],
        patchPair: {
            source: "The Eiffel Tower is in the city of",
            target: "The Colosseum is in the city of",
        },
        progression: { on: "patch" },
    }),
    unit({
        id: "u5-explore",
        kind: "challenge",
        prompts: ["The opposite of hot is"],
        progression: { on: "manual" },
    }),
    unit({
        id: "u6-challenge",
        kind: "challenge",
        prompts: ["The capital city of Australia is"],
        progression: { on: "manual" },
    }),
];

/** Apply whatever the restore asks for, as the area's effect does. */
const enter = (idx: number, box: { source: string; target: string }) => {
    const restore = promptsForUnitEntry(fullUnits, idx, box);
    return { source: restore?.source ?? box.source, target: restore?.target ?? box.target };
};

describe("promptsForUnitEntry over a whole tutorial", () => {
    it("leaves a prompt the arriving step extends", () => {
        // u0b's task is "add to what's there and run it again", and its bank holds
        // the already-appended form. Replacing the box would do the task on arrival,
        // skipping the point of the step and its hint ladder.
        const box = enter(1, { source: "The Eiffel Tower is in the city of", target: "" });
        expect(box.source).toBe("The Eiffel Tower is in the city of");
    });

    it("still fills the append step when the box is empty or stale", () => {
        expect(enter(1, { source: "", target: "" }).source).toBe(
            "The Eiffel Tower is in the city of Paris",
        );
        expect(
            enter(1, { source: "The largest planet in the solar system is", target: "" }).source,
        ).toBe("The Eiffel Tower is in the city of Paris");
    });

    it("walks forward leaving every step with prompts that match it", () => {
        let box = { source: "", target: "" };
        for (let i = 0; i < fullUnits.length; i++) {
            box = enter(i, box);
            const u = fullUnits[i];
            if (u.patchPair) {
                expect(box).toEqual({ source: u.patchPair.source, target: u.patchPair.target });
            } else if (i === 1) {
                // The append step legitimately keeps the previous step's prompt.
                expect(u.prompts.some((p) => p.startsWith(box.source))).toBe(true);
            } else {
                expect(u.prompts).toContain(box.source);
                expect(box.target).toBe("");
            }
        }
    });

    it("walks back to the first step with that step's prompt, not the last one's", () => {
        // The regression, end to end: reach the final challenge, write a prompt of
        // your own there, then walk back to fill in the checks you skipped. Every
        // guided step on the way back gets its own prompt again.
        let box = { source: "", target: "" };
        for (let i = 0; i < fullUnits.length; i++) box = enter(i, box);
        box = { ...box, source: "2+2=5\n3+3=7\n10+10=" }; // their own challenge attempt
        for (let i = fullUnits.length - 2; i >= 0; i--) box = enter(i, box);
        expect(box).toEqual({ source: "The Eiffel Tower is in the city of", target: "" });
    });
});
