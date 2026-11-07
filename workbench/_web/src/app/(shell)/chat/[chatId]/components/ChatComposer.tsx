import { useState } from "react";
import { CornerDownLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ChatMode, GenerationParams } from "@/types/chats";
import { GenerationSettings } from "./GenerationSettings";

const MODE_LABEL: Record<ChatMode, string> = { chat: "Chat", completion: "Completion" };

/**
 * The message box under a chat, with its mode, generation settings and Send.
 * ⌘/Ctrl-Enter sends; plain Enter is a newline. In completion mode an empty
 * box continues the text. The draft comes back when a send fails.
 */
export function ChatComposer({
    mode,
    params,
    disabled,
    busy,
    canContinue,
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
    onSubmit: (content: string) => Promise<unknown>;
    onModeChange: (mode: ChatMode) => void;
    onParamsChange: (params: GenerationParams) => void;
}) {
    const [draft, setDraft] = useState("");
    const content = mode === "chat" ? draft.trim() : draft;
    const continuing = mode === "completion" && !content;
    const canSend = !disabled && !busy && (!!content || (continuing && canContinue));

    const submit = () => {
        if (!canSend) return;
        setDraft("");
        onSubmit(content).catch(() => setDraft((current) => current || draft));
    };

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                submit();
            }}
            className="rounded-md border bg-card shadow-sm transition-[border-color,box-shadow] has-[textarea:focus-visible]:border-ring has-[textarea:focus-visible]:ring-[3px] has-[textarea:focus-visible]:ring-ring/50 dark:bg-secondary"
        >
            <Textarea
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
                className="max-h-60 min-h-20 resize-none border-0 bg-transparent px-4 pt-3 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            <div className="flex flex-wrap items-center gap-1.5 p-2 pl-3">
                <Select
                    value={mode}
                    onValueChange={(value) => onModeChange(value as ChatMode)}
                    disabled={disabled || busy}
                >
                    <SelectTrigger size="sm" aria-label="Mode" className="w-auto gap-1.5">
                        <SelectValue>{MODE_LABEL[mode]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="chat">
                            <span className="flex flex-col">
                                <span>Chat</span>
                                <span className="text-xs text-muted-foreground">
                                    Turns, with the model&apos;s chat template
                                </span>
                            </span>
                        </SelectItem>
                        <SelectItem value="completion">
                            <span className="flex flex-col">
                                <span>Completion</span>
                                <span className="text-xs text-muted-foreground">
                                    One text the model continues
                                </span>
                            </span>
                        </SelectItem>
                    </SelectContent>
                </Select>
                <GenerationSettings
                    params={params}
                    onChange={onParamsChange}
                    disabled={disabled || busy}
                />
                <Button
                    type="submit"
                    size="sm"
                    className="ml-auto"
                    disabled={!canSend}
                    title={continuing ? "Continue (⌘↵)" : "Send (⌘↵)"}
                >
                    {continuing ? "Continue" : "Send"}
                    <CornerDownLeft className="size-3.5 opacity-70 max-sm:hidden" />
                </Button>
            </div>
        </form>
    );
}
