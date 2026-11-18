/**
 * The look of a tool's prompt, shared by every tool. Its text is 16px on 28px
 * lines in a side panel and in Home's composer. A phone keeps the 16px, below
 * which iOS zooms into a field on focus, on tighter 24px lines (`phoneText`).
 * In a side panel it sits on the card surface inside a hairline border, like
 * Home's composer, and the border takes the tools' accent while it is edited.
 */
export const PROMPT_FIELD = {
    text: "!text-base !leading-7",
    phoneText: "!text-base !leading-6",
    /** A box around a prompt's tokens, or around a borderless textarea. */
    surface:
        "rounded-md border border-border bg-card transition-colors focus-within:border-tool-accent",
    /** A `Textarea` that is the field itself. */
    textarea:
        "border-border bg-card shadow-none transition-colors focus-visible:border-tool-accent focus-visible:ring-0 dark:bg-card",
} as const;
