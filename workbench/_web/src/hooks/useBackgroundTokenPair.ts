import { useEffect, useState } from "react";
import { encodeText } from "@/actions/tok";
import type { Token } from "@/types/models";

/**
 * Tokenize a prompt under two different models in the background. The result
 * is never written to the visible token state — callers use it only for
 * comparison (e.g. "does this prompt tokenize differently under the workspace
 * model than under the chart's saved model?").
 *
 * Returns `[null, null]` while either tokenization is unsettled or when the
 * inputs are missing. When the two models are identical, the second slot is
 * `null` (callers treat that as "no comparison needed").
 *
 * Each tool that wants a tokenization-differs comparison instantiates one of
 * these per prompt (lens2 once, AP twice for src/tgt). The cancellation
 * scheme handles fast prompt/model changes without leaking stale promises
 * back into state.
 */
export function useBackgroundTokenPair(
    prompt: string | null | undefined,
    savedModel: string | null | undefined,
    selectedModel: string | null | undefined,
): { underSaved: Token[] | null; underSelected: Token[] | null } {
    const [underSaved, setUnderSaved] = useState<Token[] | null>(null);
    const [underSelected, setUnderSelected] = useState<Token[] | null>(null);

    useEffect(() => {
        if (!prompt || !savedModel) {
            setUnderSaved(null);
            return;
        }
        let cancelled = false;
        encodeText(prompt, savedModel)
            .then((tokens) => {
                if (!cancelled) setUnderSaved(tokens);
            })
            .catch(() => {
                if (!cancelled) setUnderSaved(null);
            });
        return () => {
            cancelled = true;
        };
    }, [prompt, savedModel]);

    useEffect(() => {
        if (!prompt || !selectedModel || savedModel === selectedModel) {
            setUnderSelected(null);
            return;
        }
        let cancelled = false;
        encodeText(prompt, selectedModel)
            .then((tokens) => {
                if (!cancelled) setUnderSelected(tokens);
            })
            .catch(() => {
                if (!cancelled) setUnderSelected(null);
            });
        return () => {
            cancelled = true;
        };
    }, [prompt, savedModel, selectedModel]);

    return { underSaved, underSelected };
}
