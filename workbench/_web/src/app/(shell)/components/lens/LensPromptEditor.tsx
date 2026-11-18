import type { ChangeEvent, KeyboardEvent, RefObject } from "react";
import { Textarea } from "@/components/ui/textarea";
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
    const styles = LensPromptEditor.TOKEN_STYLES;

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
                            ? "min-h-10 w-full resize-none overflow-hidden rounded-none border-0 bg-transparent px-4 py-2 !text-base !leading-6 shadow-none focus-visible:ring-0 dark:bg-transparent"
                            : "w-full !text-sm bg-input/30 min-h-32 !leading-5"
                    }
                    placeholder="Enter your prompt here..."
                    disabled={!interactive}
                />
            ) : (
                <div
                    ref={tokenContainerRef}
                    className={cn(
                        "flex w-full py-2",
                        floating ? "min-h-10 px-4" : "px-3 bg-input/30 border rounded min-h-32",
                        loading ? "cursor-progress" : "cursor-text",
                    )}
                    onClick={() => {
                        if (interactive) onEdit();
                    }}
                >
                    <div className="w-full custom-scrollbar select-none whitespace-pre-wrap break-words">
                        {tokens.map((token, idx) => {
                            const { result, numNewlines } = LensPromptEditor.fixTokenText(
                                token.text,
                            );
                            return (
                                <span key={`token-${idx}`}>
                                    <span
                                        data-token-id={idx}
                                        className={cn(
                                            styles.base,
                                            styles.size[layout],
                                            "bg-transparent",
                                            !loading && styles.hover,
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
                                className={cn(
                                    styles.base,
                                    styles.size[layout],
                                    "cursor-default italic text-zinc-500 dark:text-zinc-400",
                                )}
                                title={`Predicted next token: "${nextToken}"`}
                            >
                                {LensPromptEditor.fixTokenText(nextToken).result}
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

LensPromptEditor.TOKEN_STYLES = {
    base: "whitespace-pre-wrap break-words select-none !box-border relative",
    /** The floating composer's text is 16px, which a phone doesn't zoom into. */
    size: { panel: "!text-sm !leading-5", floating: "!text-base !leading-6" },
    hover: "hover:bg-primary/20 hover:ring-1 hover:ring-primary/30 hover:ring-inset",
} as const;

/** A token's text with its control characters spelled out, and how many newlines it held. */
LensPromptEditor.fixTokenText = (text: string) => {
    const numNewlines = (text.match(/\n/g) || []).length;
    const result = text
        .replace(/\r\n/g, "\\r\\n")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");
    return { result, numNewlines };
};
