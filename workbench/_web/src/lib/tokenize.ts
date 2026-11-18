import { create } from "zustand";

import { encodeText as requestTokens } from "@/actions/tok";

interface TokenizingState {
    /** How many requests are under way for each prompt (trimmed). */
    pending: Record<string, number>;
    count: (prompt: string, by: 1 | -1) => void;
}

const useTokenizing = create<TokenizingState>()((set) => ({
    pending: {},
    count: (prompt, by) =>
        set(({ pending }) => {
            const next = (pending[prompt] ?? 0) + by;
            const { [prompt]: _, ...rest } = pending;
            return { pending: next > 0 ? { ...rest, [prompt]: next } : rest };
        }),
}));

/**
 * Tokenizes a prompt on the server (`encodeText` in `actions/tok`), marking it
 * as waiting meanwhile so that whichever prompt area shows it can say so
 * (`useIsTokenizing`). A tool's prompts tokenize through this one.
 */
export async function encodeText(...args: Parameters<typeof requestTokens>) {
    const prompt = args[0].trim();
    if (!prompt) return requestTokens(...args);
    const { count } = useTokenizing.getState();
    count(prompt, 1);
    try {
        return await requestTokens(...args);
    } finally {
        count(prompt, -1);
    }
}

/** Whether this prompt is waiting on its tokens. */
export function useIsTokenizing(prompt: string): boolean {
    return useTokenizing((s) => (s.pending[prompt.trim()] ?? 0) > 0);
}
