"use server";

import type { Token } from "@/types/models";
import { PreTrainedTokenizer } from "@huggingface/transformers";
import { TokenizerLoadError } from "@/actions/errors";

// Module-level cache for tokenizers by model name
const tokenizerCache = new Map<string, PreTrainedTokenizer>();

async function getTokenizer(modelName: string): Promise<PreTrainedTokenizer> {
    const cached = tokenizerCache.get(modelName);
    if (cached) return cached;

    const tokenizer = await PreTrainedTokenizer.from_pretrained(modelName);
    tokenizerCache.set(modelName, tokenizer);
    return tokenizer;
}

export async function encodeText(
    text: string,
    model: string,
    addSpecialTokens: boolean = true,
): Promise<Token[]> {
    if (!model) throw new Error("No model specified");
    if (!text || !text.trim()) return [];

    let tokenizer: PreTrainedTokenizer;
    try {
        tokenizer = await getTokenizer(model);
    } catch (error) {
        throw new TokenizerLoadError(model, error);
    }

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
    }));

    return tokens;
}
