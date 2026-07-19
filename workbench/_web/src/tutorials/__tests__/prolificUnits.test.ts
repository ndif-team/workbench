import { describe, it, expect } from "bun:test";
import { TUTORIAL_UNITS, unit3SuccessPredicate, getUnit } from "@/tutorials/prolificUnits";
import { TUTORIAL_STEP_ORDER } from "@/tutorials/prolificSteps";
import { finalTopKTokens } from "@/lib/lens-last-row";
import type { LogitLensIntroData } from "@/types/logitLensIntro";

describe("prolific tutorial units", () => {
    it("has 7 units whose ids and order match the canonical step contract", () => {
        expect(TUTORIAL_UNITS.length).toBe(7);
        expect(TUTORIAL_UNITS.map((u) => u.id)).toEqual([...TUTORIAL_STEP_ORDER]);
        // indices are sequential 0..6
        expect(TUTORIAL_UNITS.map((u) => u.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });

    it("gives every unit a task, concept callout, and observation prompt", () => {
        for (const u of TUTORIAL_UNITS) {
            expect(u.task.length).toBeGreaterThan(0);
            expect(u.concept.length).toBeGreaterThan(0);
            expect(u.observationPrompt.length).toBeGreaterThan(0);
        }
    });

    it("marks the patching unit with a source/target pair", () => {
        const patch = TUTORIAL_UNITS.find((u) => u.kind === "patch")!;
        expect(patch.patchPair?.source).toBeTruthy();
        expect(patch.patchPair?.target).toBeTruthy();
    });

    it("unit-3 success = model answers 5+5 with anything but 10", () => {
        expect(unit3SuccessPredicate("10")).toBe(false);
        expect(unit3SuccessPredicate(" 10")).toBe(false); // leading-space token
        expect(unit3SuccessPredicate(" 11")).toBe(true);
        expect(unit3SuccessPredicate("9")).toBe(true);
        expect(unit3SuccessPredicate(null)).toBe(false);
    });

    it("getUnit returns by index and undefined out of range", () => {
        expect(getUnit(0)?.id).toBe("u0-orientation");
        expect(getUnit(99)).toBeUndefined();
    });
});

describe("finalTopKTokens", () => {
    // 2 layers, 2 positions; final layer=idx1, last position=idx1.
    const data = {
        layers: [0, 1],
        input: ["The", " capital"],
        topk: [
            // layer 0
            [
                [" a", " the"],
                [" a", " the"],
            ],
            // layer 1 (final): last position candidates
            [
                [" x", " y"],
                [" Paris", " London", " Rome"],
            ],
        ],
        tracked: [
            {},
            {
                " Paris": [0.1, 0.7],
                " London": [0.1, 0.2],
                " Rome": [0.1, 0.05],
            },
        ],
    } as unknown as LogitLensIntroData;

    it("returns final-layer top-k ranked by probability", () => {
        expect(finalTopKTokens(data, 2)).toEqual([" Paris", " London"]);
        expect(finalTopKTokens(data, 1)).toEqual([" Paris"]);
    });

    it("returns [] on malformed data", () => {
        expect(finalTopKTokens(null, 2)).toEqual([]);
        expect(finalTopKTokens({} as LogitLensIntroData, 2)).toEqual([]);
    });
});
