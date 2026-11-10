import { useLayoutEffect, useRef, useState, type Ref } from "react";
import { ArrowUp, ChevronsRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ChatMode, GenerationParams } from "@/types/chats";
import { GenerationSettings } from "./GenerationSettings";

/**
 * The message box under a chat: the text, which grows as it's written, over a
 * row with the chat's settings (mode included, `GenerationSettings`) and Send.
 * ⌘/Ctrl-Enter sends; plain Enter is a newline. In completion mode an empty
 * box continues the text. The draft comes back when a send fails.
 */
export function ChatComposer({
    mode,
    params,
    disabled,
    busy,
    canContinue,
    autoFocus = false,
    readOnly = false,
    modeLocked = false,
    formRef,
    onSubmit,
    onModeChange,
    onParamsChange,
}: {
    mode: ChatMode;
    params: GenerationParams;
    disabled: boolean;
    /** A reply is running: no sending until it settles. */
    busy: boolean;
    /** There is text to continue (completion mode). */
    canContinue: boolean;
    /** Takes focus when it mounts (a chat just started from Home's composer). */
    autoFocus?: boolean;
    /** Focusable but takes no input: the composer of a chat still being started. */
    readOnly?: boolean;
    /** The chat has messages, which settle its mode (`isModeLocked`). */
    modeLocked?: boolean;
    /** The box itself, for the page that glides it into place (`PendingChatPage`). */
    formRef?: Ref<HTMLFormElement>;
    onSubmit: (content: string) => Promise<unknown>;
    onModeChange: (mode: ChatMode) => void;
    onParamsChange: (params: GenerationParams) => void;
}) {
    const [draft, setDraft] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    useLayoutEffect(() => fitHeight(textareaRef.current), [draft]);
    const content = mode === "chat" ? draft.trim() : draft;
    const continuing = mode === "completion" && !content;
    const canSend = !disabled && !busy && (!!content || (continuing && canContinue));
    const action = continuing ? "Continue" : "Send";

    const submit = () => {
        if (!canSend) return;
        setDraft("");
        onSubmit(content).catch(() => setDraft((current) => current || draft));
    };

    return (
        <form
            ref={formRef}
            onSubmit={(e) => {
                e.preventDefault();
                submit();
            }}
            className="rounded-md border bg-card shadow-sm transition-[border-color,box-shadow] has-[textarea:focus-visible]:border-ring has-[textarea:focus-visible]:ring-[3px] has-[textarea:focus-visible]:ring-ring/50 dark:bg-secondary"
        >
            <Textarea
                ref={textareaRef}
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        submit();
                    }
                }}
                placeholder={
                    mode === "chat"
                        ? "Message the model…"
                        : "Add text, or leave it empty to continue…"
                }
                aria-label={mode === "chat" ? "Message" : "Text to add"}
                disabled={disabled}
                autoFocus={autoFocus}
                readOnly={readOnly}
                className="max-h-60 min-h-0 resize-none border-0 bg-transparent px-3 pb-1 pt-2.5 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            <div className="flex items-center justify-end gap-1 p-1.5 pt-0">
                <GenerationSettings
                    mode={mode}
                    params={params}
                    onModeChange={onModeChange}
                    onChange={onParamsChange}
                    disabled={disabled || busy}
                    modeLocked={modeLocked}
                />
                <Button
                    type="submit"
                    size="icon"
                    disabled={!canSend}
                    aria-label={action}
                    title={`${action} (⌘↵)`}
                >
                    {continuing ? <ChevronsRight /> : <ArrowUp />}
                </Button>
            </div>
        </form>
    );
}

/** Sizes the box to its text, up to its max height, past which it scrolls. */
function fitHeight(textarea: HTMLTextAreaElement | null) {
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
}
