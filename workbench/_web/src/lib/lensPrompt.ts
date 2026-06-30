/**
 * Prompt normalization for the logit-lens tools.
 *
 * A trailing (or leading) space tokenizes as its own whitespace token, after
 * which the model overwhelmingly predicts more whitespace/digits instead of the
 * intended next word — e.g. "The Eiffel Tower is in the city of " collapses
 * "Paris" from ~89% to ~2%. So by default we trim surrounding whitespace before
 * tokenizing/running, and reflect the trimmed text back to the user so it's
 * clear what was sent.
 *
 * `preserveWhitespace` is the deliberate escape hatch: when true the prompt is
 * sent verbatim, for the rare experiment that needs the surrounding whitespace.
 */
export function normalizeLensPrompt(prompt: string, preserveWhitespace = false): string {
    return preserveWhitespace ? prompt : prompt.trim();
}
