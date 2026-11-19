import { create } from "zustand";

import { encodeText as requestTokens } from "@/actions/tok";
import type { Token } from "@/types/models";

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

type TokenRequest = Parameters<typeof requestTokens>;

/**
 * The tokens already asked for in this tab, by prompt and model. A prompt's
 * tokens never change, so a prompt tokenized on Home is not sent again by the
 * chart it opens, and repeated requests for one prompt share a single call.
 */
class TokenCache {
    private static readonly LIMIT = 200;
    private static readonly entries = new Map<
        string,
        { tokens: Promise<Token[]>; settled: boolean }
    >();

    /** Whether these tokens have arrived, so asking for them is no wait. */
    static has(args: TokenRequest): boolean {
        return this.entries.get(JSON.stringify(args))?.settled ?? false;
    }

    static get(args: TokenRequest): Promise<Token[]> {
        const key = JSON.stringify(args);
        const cached = this.entries.get(key);
        if (cached) return cached.tokens;
        const entry = { tokens: requestTokens(...args), settled: false };
        this.entries.set(key, entry);
        entry.tokens.then(
            () => {
                entry.settled = true;
            },
            () => {
                if (this.entries.get(key) === entry) this.entries.delete(key);
            },
        );
        if (this.entries.size > this.LIMIT) {
            this.entries.delete(this.entries.keys().next().value as string);
        }
        return entry.tokens;
    }
}

/**
 * Tokenizes a prompt on the server (`encodeText` in `actions/tok`), marking it
 * as waiting meanwhile so that whichever prompt area shows it can say so
 * (`useIsTokenizing`). A tool's prompts tokenize through this one.
 */
export async function encodeText(...args: TokenRequest): Promise<Token[]> {
    const prompt = args[0].trim();
    if (!prompt) return requestTokens(...args);
    if (TokenCache.has(args)) return TokenCache.get(args);
    const { count } = useTokenizing.getState();
    count(prompt, 1);
    try {
        return await TokenCache.get(args);
    } finally {
        count(prompt, -1);
    }
}

/** Tokenizes a prompt without marking it as waiting, for tokens no prompt
 * area shows (a comparison under another model). */
export function encodeTextQuietly(...args: TokenRequest): Promise<Token[]> {
    if (!args[0].trim()) return requestTokens(...args);
    return TokenCache.get(args);
}

/** Whether this prompt is waiting on its tokens. */
export function useIsTokenizing(prompt: string): boolean {
    return useTokenizing((s) => (s.pending[prompt.trim()] ?? 0) > 0);
}

/** A lens result's `input` (the prompt's tokens as text) as prompt tokens. The
 * result carries no vocabulary ids, so each `id` is -1. */
export function resultTokens(input: string[]): Token[] {
    return input.map((text, idx) => ({ idx, id: -1, text }));
}
