import { describe, it, expect } from "bun:test";
import { isCompletionSignalToken, promptPhrasingWarning } from "@/lib/promptPhrasing";

describe("prompt-phrasing guardrail", () => {
    it("flags whitespace / newline top tokens", () => {
        expect(isCompletionSignalToken("\n")).toBe(true);
        expect(isCompletionSignalToken("  ")).toBe(true);
        expect(isCompletionSignalToken(" ")).toBe(true);
    });

    it("flags punctuation-only top tokens (including leading-space variants)", () => {
        expect(isCompletionSignalToken(".")).toBe(true);
        expect(isCompletionSignalToken(" .")).toBe(true);
        expect(isCompletionSignalToken("!")).toBe(true);
        expect(isCompletionSignalToken("…")).toBe(true);
        expect(isCompletionSignalToken('"')).toBe(true);
    });

    it("flags EOS markers across tokenizers", () => {
        expect(isCompletionSignalToken("<|endoftext|>")).toBe(true);
        expect(isCompletionSignalToken("</s>")).toBe(true);
        expect(isCompletionSignalToken("<|eot_id|>")).toBe(true);
    });

    it("does not flag real word tokens", () => {
        expect(isCompletionSignalToken(" Paris")).toBe(false);
        expect(isCompletionSignalToken("Paris")).toBe(false);
        expect(isCompletionSignalToken(" 10")).toBe(false);
        expect(isCompletionSignalToken("apple")).toBe(false);
    });

    it("handles null / undefined without throwing", () => {
        expect(isCompletionSignalToken(null)).toBe(false);
        expect(isCompletionSignalToken(undefined)).toBe(false);
    });

    it("returns a warning string only for completion signals", () => {
        expect(promptPhrasingWarning(".")).toBeTruthy();
        expect(promptPhrasingWarning(" Paris")).toBeNull();
        expect(promptPhrasingWarning(null)).toBeNull();
    });
});
