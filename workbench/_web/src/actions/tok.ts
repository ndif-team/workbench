"use server";

import type { Token, TokenOption } from "@/types/models";
import { PreTrainedTokenizer } from "@huggingface/transformers";

// Interface for scoring tokens
interface RawToken {
    id: number;
    token: string;
    normalized: string;
    normalizedNoSpace: string;
}

// Module-level cache for tokenizers by model name
const tokenizerCache = new Map<string, PreTrainedTokenizer>();
const tokenListCache = new Map<string, Array<RawToken>>();

async function getTokenizer(modelName: string): Promise<PreTrainedTokenizer> {
    const cached = tokenizerCache.get(modelName);
    if (cached) return cached;

    const tokenizer = await PreTrainedTokenizer.from_pretrained(modelName);
    tokenizerCache.set(modelName, tokenizer);
    return tokenizer;
}

interface DecodeResponse {
    text: string;
}

interface BatchDecodeResponse {
    texts: string[];
}

export async function encodeText(
    text: string,
    model: string,
    addSpecialTokens: boolean = true,
): Promise<Token[]> {
    try {
        if (!model) throw new Error("No model specified");
        if (!text || !text.trim()) return [];

        const tokenizer = await getTokenizer(model);
        const tokenIds = await Promise.resolve(
            tokenizer.encode(text, { add_special_tokens: addSpecialTokens }) as unknown as
                | Promise<number[]>
                | number[],
        );
        const ids = Array.isArray(tokenIds) ? tokenIds : await tokenIds;

        const tokens: Token[] = ids.map((id, index) => ({
            id,
            text: tokenizer.decode([id]),
            idx: index,
            targetIds: [],
        }));

        return tokens;
    } catch (error) {
        // Mirror tokenize.ts behavior: return [] on failure
        console.error(error);
        return [];
    }
}

export async function decodeText(
    tokenIds: number[],
    model: string,
    batch: boolean = false,
): Promise<DecodeResponse | BatchDecodeResponse> {
    try {
        if (!model) throw new Error("No model specified");
        if (!tokenIds || tokenIds.length === 0) {
            return batch ? { texts: [] } : { text: "" };
        }

        const tokenizer = await getTokenizer(model);

        if (batch) {
            const texts = tokenIds.map((id) => tokenizer.decode([id]));
            return { texts };
        }

        const text = tokenizer.decode(tokenIds);
        return { text };
    } catch (error) {
        // Mirror tokenize.ts behavior: return empty structure on failure
        return batch ? { texts: [] } : { text: "" };
    }
}

export async function isTokenizerCached(modelName: string): Promise<boolean> {
    return tokenizerCache.has(modelName);
}

export async function clearTokenizerCache(): Promise<void> {
    tokenizerCache.clear();
    tokenListCache.clear();
}

function normalizeTokenForSearch(token: string): string {
    // Map common tokenizer markers to their intended whitespace/newline characters, preserving case
    // - GPT2/BBPE: 'Ġ' indicates a leading space, 'Ċ' often encodes a newline
    // - SentencePiece: '▁' indicates a leading space
    // We replace globally to be safe, though they most often occur at the start
    return token.replace(/Ċ/g, "\n").replace(/Ġ/g, " ").replace(/▁/g, " ");
}

function interpretEscapes(input: string): string {
    // Interpret common escape sequences so that queries like "\n" search for a newline
    // Keep everything else as literal
    return input
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\\\/g, "\\");
}

async function getOrBuildTokenList(model: string): Promise<Array<RawToken>> {
    const cached = tokenListCache.get(model);
    if (cached) return cached;

    const tokenizer = await getTokenizer(model);

    const vocab: string[] = tokenizer.model.vocab;
    const entries = vocab.map((token, id) => {
        const searchForm = normalizeTokenForSearch(token);
        return {
            id,
            token: searchForm,
            normalized: searchForm,
            normalizedNoSpace: searchForm,
        } as RawToken;
    });

    tokenListCache.set(model, entries);
    return entries;
}

export async function queryTokens(
    query: string,
    model: string,
    limit: number = 50,
): Promise<TokenOption[]> {
    if (!model) throw new Error("No model specified");
    const raw = query ?? "";
    // Query should fire for any non-empty input, including whitespace/newline
    if (raw.length === 0) return [];
    const q = interpretEscapes(raw);

    const tokens = await getOrBuildTokenList(model);

    // Case- and whitespace-sensitive scoring: startsWith > includes
    const scored = tokens
        .map((t) => {
            const candidate = t.token;
            let score = Number.POSITIVE_INFINITY;
            if (candidate.startsWith(q)) score = 0;
            else if (candidate.includes(q)) score = 1;
            return { t, score };
        })
        .filter((s) => s.score !== Number.POSITIVE_INFINITY)
        .sort((a, b) => a.score - b.score || a.t.token.length - b.t.token.length)
        .slice(0, Math.max(1, Math.min(200, limit * 2))); // keep a bit extra before decode

    const results: TokenOption[] = [];
    for (const { t } of scored) {
        results.push({ value: t.id, text: t.token });
        if (results.length >= limit) break;
    }
    return results;
}
