/**
 * The look of a tool's prompt, shared by every tool. Its text is 14px on 24px
 * lines in a side panel, in Home's composer and on a phone. iOS zooms into a
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
    /** A `Textarea` that is the field itself. */
    textarea:
        "border-border bg-card shadow-none transition-colors focus-visible:border-tool-accent focus-visible:ring-0 dark:bg-card",
} as const;
