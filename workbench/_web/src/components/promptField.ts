/**
 * The look of a tool's prompt, shared by every tool. Its text is 14px on 24px
 * lines in a side panel and in a phone's composer; Home's composer, the page's
 * one subject, sets it a size larger. iOS zooms into a
 * focused field under 16px, so there a prompt's textarea is 16px while it is
 * edited (`prompt-input` in `globals.css`).
 * In a side panel it sits on the card surface inside a hairline border, like
 * Home's composer, and the border takes the tools' accent while it is edited.
 */
export const PROMPT_FIELD = {
    text: "prompt-input !text-sm !leading-6",
    /** A box around a prompt's tokens, or around a borderless textarea. */
    surface:
        "rounded-md border border-border bg-card transition-colors focus-within:border-tool-accent",
    /** A composer card around a bare textarea: the same accent border while it is edited. */
    composer: "has-[textarea:focus-visible]:border-tool-accent",
    /** A prompt waiting on its tokens (`useIsTokenizing`): its text breathes. */
    tokenizing: "animate-pulse cursor-progress motion-reduce:animate-none",
    /** A `Textarea` that is the field itself. */
    textarea:
        "border-border bg-card shadow-none transition-colors focus-visible:border-tool-accent focus-visible:ring-0 dark:bg-card",
} as const;

/**
 * The look of a tokenized prompt, shared by every tool: plain text at rest,
 * with the pointer outlining the token under it and its neighbors
 * (`prompt-tokens` in `globals.css`) and tinting the one it is on.
 */
export const PROMPT_TOKENS = {
    /** The element holding the tokens, each one a `[data-token-id]` in a span of its own. */
    list: "prompt-tokens w-full custom-scrollbar select-none whitespace-pre-wrap break-words",
    token: "whitespace-pre-wrap break-words select-none !box-border relative px-0.5 py-0.5 rounded-sm transition-all",
    /** A ring for the pointer to color; all of them show in a phone's composer in use. */
    outline: "ring-1 ring-inset ring-transparent group-data-[active=true]/composer:ring-border",
    hover: "hover:bg-tool-accent/20 hover:ring-tool-accent/50",
    /** The model's predicted next token, after the prompt's own. */
    prediction: "cursor-default italic text-muted-foreground",
    /** A token's text with its control characters spelled out, and how many newlines it held. */
    fixText(text: string) {
        const numNewlines = (text.match(/\n/g) || []).length;
        const result = text
            .replace(/\r\n/g, "\\r\\n")
            .replace(/\n/g, "\\n")
            .replace(/\r/g, "\\r")
            .replace(/\t/g, "\\t");
        return { result, numNewlines };
    },
} as const;
