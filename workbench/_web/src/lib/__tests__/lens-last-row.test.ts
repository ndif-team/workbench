/**
 * Unit tests for the shared last-row extraction (D1 collapse + F1 history).
 */

import { describe, it, expect } from "bun:test";
import { extractLastRow, finalPrediction, finalTopKTokens } from "@/lib/lens-last-row";
import type { LogitLensIntroData } from "@/types/logitLensIntro";

// Minimal nnsightful-shaped logit-lens result: 2 layers, 2 positions.
// tracked[pos][token] = per-layer probabilities. topk[layer][pos] = token strings.
const data = {
    meta: { version: 2, timestamp: "t", model: "m" },
    layers: [0, 1],
    input: ["The", " Eiffel"],
    tracked: [
        { The: [0.5, 0.6], a: [0.1, 0.05] },
        { " Tower": [0.3, 0.8], " museum": [0.4, 0.1] },
    ],
    topk: [
        [
            ["The", "a"],
            [" museum", " Tower"],
        ],
        [
            ["The", "a"],
            [" Tower", " museum"],
        ],
    ],
    entropy: null,
} as unknown as LogitLensIntroData;

describe("extractLastRow", () => {
    it("returns per-layer top-1 token+prob for the FINAL position", () => {
        const row = extractLastRow(data);
        expect(row).not.toBeNull();
        expect(row!.layers).toEqual([0, 1]);
        // Final position is index 1 (" Eiffel"). Layer 0: candidates museum(0.4) vs Tower(0.3) → museum.
        expect(row!.cells[0]).toEqual({ token: " museum", prob: 0.4 });
        // Layer 1: Tower(0.8) vs museum(0.1) → Tower.
        expect(row!.cells[1]).toEqual({ token: " Tower", prob: 0.8 });
    });

    it("finalPrediction is the final layer's top-1 at the final position", () => {
        expect(finalPrediction(data)).toBe(" Tower");
    });

    it("returns null on empty/malformed data", () => {
        expect(extractLastRow(null)).toBeNull();
        expect(extractLastRow(undefined)).toBeNull();
        expect(
            extractLastRow({
                layers: [],
                input: [],
                tracked: [],
                topk: [],
            } as unknown as LogitLensIntroData),
        ).toBeNull();
        expect(finalPrediction(null)).toBeNull();
    });
});

// finalTopKTokens ranks the final-layer candidates at the last position by
// probability — it auto-scores unit 2's "second-ranked next token" embedded
// check (PatchLensArea captures `finalTopKTokens(source, 2)[1]`). Ported from
// the retired prolificUnits.test.ts so a runner-up mis-rank stays caught.
describe("finalTopKTokens", () => {
    // 2 layers, 2 positions; final layer=idx1, last position=idx1.
    const topkData = {
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
        expect(finalTopKTokens(topkData, 2)).toEqual([" Paris", " London"]);
        expect(finalTopKTokens(topkData, 1)).toEqual([" Paris"]);
    });

    it("returns [] on malformed data", () => {
        expect(finalTopKTokens(null, 2)).toEqual([]);
        expect(finalTopKTokens({} as LogitLensIntroData, 2)).toEqual([]);
    });
});
