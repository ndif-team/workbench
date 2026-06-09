"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { CornerDownLeft, Loader2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GenerationParamsPopover } from "./GenerationParamsPopover";
import type { GenerationParams } from "@/types/generation";

interface GenerationComposerProps {
    params: GenerationParams;
    onParamsChange: (patch: Partial<GenerationParams>) => void;
    onSubmit: (prompt: string) => void;
    isPending: boolean;
    disabled?: boolean;
    placeholder?: string;
}

const DRAFT_LIMIT = 4096;

export function GenerationComposer({
    params,
    onParamsChange,
    onSubmit,
    isPending,
    disabled,
    placeholder = "Enter a prompt…",
}: GenerationComposerProps) {
    const [value, setValue] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        const next = Math.min(Math.max(el.scrollHeight, 56), 220);
        el.style.height = `${next}px`;
    }, [value]);

    const trimmed = value.trim();
    const canSubmit = !disabled && !isPending && trimmed.length > 0;

    const handleSubmit = () => {
        if (!canSubmit) return;
        onSubmit(trimmed);
        setValue("");
        textareaRef.current?.focus();
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
            }}
            className="flex flex-col gap-2"
        >
            <Textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => setValue(e.target.value.slice(0, DRAFT_LIMIT))}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                rows={2}
                aria-label="Prompt"
                spellCheck={false}
                className={cn(
                    "min-h-14 resize-none font-mono text-[13px] leading-5",
                    "scrollbar-hide",
                )}
            />

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                    <GenerationParamsPopover
                        params={params}
                        onChange={onParamsChange}
                        disabled={disabled}
                    />
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7 text-muted-foreground hover:text-foreground"
                                aria-label="Keyboard shortcut"
                            >
                                <Info className="size-3.5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                            <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">
                                ⌘
                            </kbd>{" "}
                            +{" "}
                            <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">
                                ↵
                            </kbd>{" "}
                            to send
                        </TooltipContent>
                    </Tooltip>
                </div>
                <Button type="submit" size="sm" disabled={!canSubmit} aria-label="Generate">
                    {isPending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                        <CornerDownLeft className="size-3.5" />
                    )}
                    {isPending ? "Generating" : "Generate"}
                </Button>
            </div>
        </form>
    );
}
