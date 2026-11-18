import type { ChangeEvent, KeyboardEvent, RefObject } from "react";
import { Textarea } from "@/components/ui/textarea";
import { PROMPT_FIELD, PROMPT_TOKENS } from "@/components/promptField";
import { cn } from "@/lib/utils";
import type { Token } from "@/types/models";

interface LensPromptEditorProps {
    /** "panel" is the side panel; "floating" is the phone's composer over the
     * chart (`FloatingToolComposer`). */
    layout: "panel" | "floating";
    /** True shows the textarea; false shows the prompt's tokens. */
    editing: boolean;
    prompt: string;
    tokens: Token[];
    /** The saved run's predicted next token, shown after the prompt's tokens. */
    nextToken?: string | null;
    /** A run is in progress. */
    loading: boolean;
    interactive: boolean;
    textareaRef: RefObject<HTMLTextAreaElement>;
    tokenContainerRef: RefObject<HTMLDivElement>;
    onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
    onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
    onBlur: () => void;
    /** A click on the tokens, to go back to editing. */
    onEdit: () => void;
}

/**
 * The prompt of a logit-lens or j-lens chart: a textarea while it is edited,
 * its tokens otherwise.
 */
export function LensPromptEditor({
    layout,
    editing,
    prompt,
    tokens,
    nextToken,
    loading,
    interactive,
    textareaRef,
    tokenContainerRef,
    onChange,
    onKeyDown,
    onBlur,
    onEdit,
}: LensPromptEditorProps) {
    const floating = layout === "floating";
    const text = PROMPT_FIELD.text;

    return (
        <div className="relative">
            {editing ? (
                <Textarea
                    ref={textareaRef}
                    value={prompt}
                    onChange={onChange}
                    onKeyDown={onKeyDown}
                    onBlur={onBlur}
                    aria-label="Prompt"
                    className={
                        floating
                            ? cn(
                                  "min-h-10 w-full resize-none overflow-hidden rounded-none border-0 bg-transparent px-4 py-2 shadow-none focus-visible:ring-0 dark:bg-transparent",
                                  PROMPT_FIELD.text,
                              )
                            : cn("min-h-32 w-full", PROMPT_FIELD.text, PROMPT_FIELD.textarea)
                    }
                    placeholder="Enter your prompt here..."
                    disabled={!interactive}
                />
            ) : (
                <div
                    ref={tokenContainerRef}
                    className={cn(
                        "flex w-full",
                        floating
                            ? "min-h-10 px-4 py-2"
                            : cn("min-h-32 px-3 py-2", PROMPT_FIELD.surface),
                        loading ? "cursor-progress" : "cursor-text",
                    )}
                    onClick={() => {
                        if (interactive) onEdit();
                    }}
                >
                    <div className={PROMPT_TOKENS.list}>
                        {tokens.map((token, idx) => {
                            const { result, numNewlines } = PROMPT_TOKENS.fixText(token.text);
                            return (
                                <span key={`token-${idx}`}>
                                    <span
                                        data-token-id={idx}
                                        className={cn(
                                            PROMPT_TOKENS.token,
                                            PROMPT_TOKENS.outline,
                                            text,
                                            !loading && PROMPT_TOKENS.hover,
                                            token.text === "\\n" ? "w-full" : "w-fit",
                                            loading ? "cursor-progress" : "cursor-default",
                                        )}
                                    >
                                        {result}
                                    </span>
                                    {numNewlines > 0 && "\n".repeat(numNewlines)}
                                </span>
                            );
                        })}
                        {nextToken && tokens.length > 0 && (
                            <span
                                className={cn(PROMPT_TOKENS.token, text, PROMPT_TOKENS.prediction)}
                                title={`Predicted next token: "${nextToken}"`}
                            >
                                {PROMPT_TOKENS.fixText(nextToken).result}
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
