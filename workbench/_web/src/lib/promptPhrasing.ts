/**
 * Prompt-phrasing guardrail (Prolific tutorial spec §4.2).
 *
 * Pilot failure #1: participants wrote free-form prompts whose top predicted
 * next token was a newline / punctuation / end-of-text, then concluded the tool
 * was broken. This is pure client-side detection off a completed run's top
 * predicted token — no backend change. The UI shows a soft, non-blocking warning
 * ("phrase your prompt so the answer is the very next word").
 */

// End-of-sequence markers across the tokenizers the workbench models use.
const EOS_TOKENS = new Set([
    "<|endoftext|>",
    "<|eot_id|>",
    "<|end_of_text|>",
    "</s>",
    "<eos>",
    "<end_of_turn>",
    "<｜end▁of▁sentence｜>",
]);

// Punctuation-only tokens that mean "the model thinks this sentence is done".
// Leading-space variants (e.g. " .") are covered by trimming before the test.
const PUNCTUATION = /^[.,;:!?…·—–\-'"“”‘’()\[\]{}]+$/;

/**
 * Does this top predicted token signal the model considers the text complete
 * (so the "answer" won't come next)? True for whitespace/newline, punctuation,
 * and EOS markers.
 */
export function isCompletionSignalToken(token: string | null | undefined): boolean {
    if (token == null) return false;
    if (EOS_TOKENS.has(token.trim())) return true;
    // Whitespace/newline-only token (spaces, tabs, \n) — nothing but a boundary.
    if (token.trim().length === 0) return true;
    return PUNCTUATION.test(token.trim());
}

const WARNING =
    "The model thinks this text is complete. Try rephrasing so the answer comes next " +
    "(e.g. end with “the answer is”).";

/**
 * Warning string to show under the run when the top predicted token signals
 * completion, else null. Callers render it as a soft inline hint, never a block.
 */
export function promptPhrasingWarning(topToken: string | null | undefined): string | null {
    return isCompletionSignalToken(topToken) ? WARNING : null;
}
