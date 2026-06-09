"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { fixTokenText, TOKEN_HOVER } from "@/lib/tokenText";
import { encodeText } from "@/actions/tok";
import type { GenerationViewMode } from "@/types/generation";

interface GenerationContentViewProps {
    prompt: string;
    /** Completion text with the prompt already stripped. */
    generated: string;
    model: string;
    /** Real per-token text of the prompt (seed) and completion, saved separately. */
    seedTokens?: string[];
    completionTokens?: string[];
    viewMode: GenerationViewMode;
}

/**
 * Renders a generation as one continuous passage. In text view the prompt is the
 * dimmed, input-like seed and the completion is the dominant foreground. In token
 * view the *entire* item is shown as the model's real tokens — seed tokens in the
 * muted style, generation tokens in the foreground style — rendered logit-lens
 * style (continuous flow + per-token hover). Boundaries are never fabricated.
 */
export function GenerationContentView({
    prompt,
    generated,
    model,
    seedTokens,
    completionTokens,
    viewMode,
}: GenerationContentViewProps) {
    // Older generations have one or both token arrays missing — tokenize the
    // prompt and completion on demand (cached). `encodeText` throws if the
    // tokenizer can't load; React Query keeps `data` undefined and we fall
    // through to text. Fetch only when token view is active and something's
    // missing.
    const needsFetch =
        viewMode === "tokens" &&
        (!seedTokens || !completionTokens) &&
        prompt.length + generated.length > 0 &&
        !!model;
    const { data: fetched, isFetching } = useQuery({
        queryKey: ["generation-tokens", model, prompt, generated],
        queryFn: async () => {
            const [seed, gen] = await Promise.all([
                encodeText(prompt, model, false),
                encodeText(generated, model, false),
            ]);
            return { seed: seed.map((t) => t.text), generated: gen.map((t) => t.text) };
        },
        enabled: needsFetch,
        staleTime: Infinity,
        retry: false,
    });

    const seed = seedTokens ?? fetched?.seed;
    const gen = completionTokens ?? fetched?.generated;

    if (viewMode === "tokens") {
        if (seed && gen) {
            return (
                <div className="whitespace-pre-wrap break-words font-mono text-xs leading-5">
                    {seed.map((tok, i) => (
                        <TokenSpan key={`s${i}`} text={tok} muted />
                    ))}
                    {gen.map((tok, i) => (
                        <TokenSpan key={`g${i}`} text={tok} />
                    ))}
                    {gen.length === 0 && <NoNewTokens />}
                </div>
            );
        }
        if (isFetching) {
            return (
                <pre className="min-w-0 whitespace-pre-wrap break-words font-mono text-xs leading-5">
                    <span className="text-muted-foreground">{prompt}</span>
                    <span className="italic text-muted-foreground/70"> · tokenizing…</span>
                </pre>
            );
        }
        // Tokenization unavailable — fall through to the plain-text passage.
    }

    return (
        <pre className="min-w-0 whitespace-pre-wrap break-words font-mono text-xs leading-5">
            <span className="text-muted-foreground">{prompt}</span>
            {generated ? <span className="text-foreground">{generated}</span> : <NoNewTokens />}
        </pre>
    );
}

/**
 * One token, rendered to flow inline with its neighbours (continuous text) and
 * highlight on hover — the logit-lens treatment. Seed tokens read muted, the
 * generation foreground. A newline token shows as `\n` and the real break is
 * re-emitted after so the passage still wraps.
 */
function TokenSpan({ text, muted }: { text: string; muted?: boolean }) {
    const { result, numNewlines } = fixTokenText(text);
    return (
        <span>
            <span
                className={cn(
                    "relative bg-transparent",
                    TOKEN_HOVER,
                    muted ? "text-muted-foreground" : "text-foreground",
                )}
            >
                {result}
            </span>
            {numNewlines > 0 && "\n".repeat(numNewlines)}
        </span>
    );
}

function NoNewTokens() {
    return <span className="text-xs italic text-muted-foreground/70"> · no new tokens</span>;
}
