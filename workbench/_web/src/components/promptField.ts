/**
 * The look of a tool's prompt, shared by every tool. Its text is 16px on 28px
 * lines in a side panel and in Home's composer. A phone keeps the 16px, below
 * which iOS zooms into a field on focus, on tighter 24px lines (`phoneText`).
 * In a side panel it sits on a faint tint with no border until it is edited,
 * when it takes the tools' accent.
 */
export const PROMPT_FIELD = {
    text: "!text-base !leading-7",
    phoneText: "!text-base !leading-6",
    /** A box around a prompt's tokens, or around a borderless textarea. */
    surface:
        "rounded-md border border-transparent bg-foreground/[0.04] transition-colors focus-within:border-tool-accent",
    /** A `Textarea` that is the field itself. */
    textarea:
        "border-transparent bg-foreground/[0.04] shadow-none transition-colors focus-visible:border-tool-accent focus-visible:ring-0 dark:bg-foreground/[0.04]",
} as const;
