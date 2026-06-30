/**
 * Unit tests for logit-lens prompt normalization.
 *
 * Regression guard: a trailing space in the prompt (e.g. "...city of ") used
 * to reach the model verbatim and collapse the prediction from "Paris" to a
 * whitespace/digit token. Default behavior now trims; an opt-in flag preserves
 * whitespace for experiments that need it.
 */

import { describe, it, expect } from "bun:test";
import { normalizeLensPrompt } from "@/lib/lensPrompt";
import { lens2ConfigEqualsExceptModel } from "@/lib/configModelDiff";
import type { Lens2ConfigData } from "@/types/lens2";

describe("normalizeLensPrompt", () => {
    const prompt = "The Eiffel Tower is in the city of ";

    it("trims surrounding whitespace by default", () => {
        expect(normalizeLensPrompt(prompt)).toBe("The Eiffel Tower is in the city of");
    });

    it("trims leading and trailing whitespace, preserving interior spaces", () => {
        expect(normalizeLensPrompt("  hello   world  ")).toBe("hello   world");
    });

    it("strips trailing newlines and tabs too", () => {
        expect(normalizeLensPrompt("prompt\n\t")).toBe("prompt");
    });

    it("preserves the prompt verbatim when preserveWhitespace is true", () => {
        expect(normalizeLensPrompt(prompt, true)).toBe(prompt);
    });

    it("is idempotent on an already-trimmed prompt", () => {
        const trimmed = normalizeLensPrompt(prompt);
        expect(normalizeLensPrompt(trimmed)).toBe(trimmed);
    });

    it("explicit false behaves like the default (trim)", () => {
        expect(normalizeLensPrompt(prompt, false)).toBe(normalizeLensPrompt(prompt));
    });
});

describe("lens2ConfigEqualsExceptModel — preserveWhitespace", () => {
    const base: Lens2ConfigData = {
        model: "meta-llama/Llama-3.1-8B",
        prompt: "The Eiffel Tower is in the city of",
        topk: 5,
        includeEntropy: true,
        preserveWhitespace: false,
    };

    it("treats a flipped preserveWhitespace as a dirty draft", () => {
        const draft = {
            prompt: base.prompt,
            topk: 5,
            includeEntropy: true,
            preserveWhitespace: true,
        };
        expect(lens2ConfigEqualsExceptModel(base, draft)).toBe(false);
    });

    it("treats matching flags as clean", () => {
        const draft = {
            prompt: base.prompt,
            topk: 5,
            includeEntropy: true,
            preserveWhitespace: false,
        };
        expect(lens2ConfigEqualsExceptModel(base, draft)).toBe(true);
    });

    it("defaults a missing flag to false (legacy configs stay clean)", () => {
        const legacy: Lens2ConfigData = {
            model: base.model,
            prompt: base.prompt,
            topk: 5,
            includeEntropy: true,
        };
        const draft = {
            prompt: base.prompt,
            topk: 5,
            includeEntropy: true,
            preserveWhitespace: false,
        };
        expect(lens2ConfigEqualsExceptModel(legacy, draft)).toBe(true);
    });
});
