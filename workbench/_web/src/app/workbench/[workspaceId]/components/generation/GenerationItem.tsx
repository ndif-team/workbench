"use client";

import { useEffect, useState } from "react";
import { Copy, Check, Trash2, AlertTriangle, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
    DEFAULT_GENERATION_PARAMS,
    type GenerationItem as GenerationItemType,
    type GenerationParams,
} from "@/types/generation";

interface GenerationItemProps {
    item: GenerationItemType;
    isActive: boolean;
    onRemove: () => void;
    onRegenerate?: () => void;
}

export function GenerationItem({ item, isActive, onRemove, onRegenerate }: GenerationItemProps) {
    const isPending = item.status === "pending";
    const isError = item.status === "error";

    const generatedText =
        item.output && item.output.startsWith(item.prompt)
            ? item.output.slice(item.prompt.length)
            : item.output ?? "";

    return (
        <article
            aria-live={isActive ? "polite" : undefined}
            className="group relative animate-in fade-in duration-200 pl-3"
        >
            <span
                aria-hidden
                className={cn(
                    "absolute left-0 top-1 bottom-1 w-px transition-colors",
                    isPending
                        ? "bg-primary"
                        : isError
                          ? "bg-destructive/60"
                          : isActive
                            ? "bg-primary/60"
                            : "bg-border",
                )}
            />

            <header className="flex items-center justify-between gap-2 pb-1.5">
                <span
                    className={cn(
                        "text-xs font-medium",
                        isPending
                            ? "text-primary"
                            : isError
                              ? "text-destructive"
                              : "text-muted-foreground",
                    )}
                >
                    {isPending ? "Running" : isError ? "Error" : "Generation"}
                </span>
                <div className="flex items-center gap-0.5 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground focus-within:text-muted-foreground">
                    {!isPending && item.output && (
                        <CopyButton text={item.output} label="Copy" />
                    )}
                    {!isPending && onRegenerate && (
                        <IconButton label="Regenerate" onClick={onRegenerate}>
                            <RotateCw className="size-3" />
                        </IconButton>
                    )}
                    {!isPending && (
                        <IconButton label="Remove" onClick={onRemove} variant="danger">
                            <Trash2 className="size-3" />
                        </IconButton>
                    )}
                </div>
            </header>

            <PromptBlock text={item.prompt} />

            <div className="mt-1.5">
                {isPending ? (
                    <PendingOutput />
                ) : isError ? (
                    <ErrorOutput message={item.error ?? "Generation failed."} />
                ) : (
                    <OutputBlock generated={generatedText} />
                )}
            </div>

            <ParamsFootnote params={item.params} />
        </article>
    );
}

function PromptBlock({ text }: { text: string }) {
    return (
        <div className="rounded-md bg-muted/40 px-2.5 py-2">
            <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-muted-foreground">
                {text}
            </pre>
        </div>
    );
}

function OutputBlock({ generated }: { generated: string }) {
    if (!generated) {
        return (
            <p className="rounded-md border border-dashed px-2.5 py-2 text-xs italic text-muted-foreground">
                No new tokens.
            </p>
        );
    }
    return (
        <div className="rounded-md border bg-card px-2.5 py-2 shadow-xs">
            <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-foreground">
                {generated}
            </pre>
        </div>
    );
}

function PendingOutput() {
    return (
        <div className="relative overflow-hidden rounded-md border bg-card px-2.5 py-2.5 shadow-xs">
            <div className="space-y-1.5">
                <span className="block h-2 w-3/4 rounded bg-muted" />
                <span className="block h-2 w-1/2 rounded bg-muted" />
            </div>
            <span
                aria-hidden
                className="pointer-events-none absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-primary/15 to-transparent"
            />
        </div>
    );
}

function ErrorOutput({ message }: { message: string }) {
    return (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
            <p className="text-xs leading-5 text-destructive">{message}</p>
        </div>
    );
}

function ParamsFootnote({ params }: { params: GenerationParams }) {
    const diffs = paramDiffs(params);
    if (diffs.length === 0) return null;
    return (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                Custom
            </span>
            {diffs.map((d) => (
                <span key={d} className="font-mono tabular-nums">
                    {d}
                </span>
            ))}
        </div>
    );
}

function paramDiffs(params: GenerationParams): string[] {
    const d = DEFAULT_GENERATION_PARAMS;
    const diffs: string[] = [];
    if (params.maxNewTokens !== d.maxNewTokens) diffs.push(`max ${params.maxNewTokens}`);
    if (params.sampling !== d.sampling) {
        if (!params.sampling) diffs.push("greedy");
    }
    if (params.sampling) {
        if (params.temperature !== d.temperature)
            diffs.push(`temp ${params.temperature.toFixed(2)}`);
        if (params.topP !== d.topP) diffs.push(`top-p ${params.topP.toFixed(2)}`);
        if (params.topK !== d.topK)
            diffs.push(`top-k ${params.topK === 0 ? "off" : params.topK}`);
    }
    if (params.stopSequences.length > 0)
        diffs.push(
            `stop ${params.stopSequences.length === 1 ? "×1" : `×${params.stopSequences.length}`}`,
        );
    return diffs;
}

function CopyButton({ text, label }: { text: string; label: string }) {
    const [copied, setCopied] = useState(false);
    useEffect(() => {
        if (!copied) return;
        const t = setTimeout(() => setCopied(false), 1200);
        return () => clearTimeout(t);
    }, [copied]);

    return (
        <IconButton
            label={copied ? "Copied" : label}
            onClick={async () => {
                try {
                    await navigator.clipboard.writeText(text);
                    setCopied(true);
                } catch {
                    /* ignore */
                }
            }}
        >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </IconButton>
    );
}

function IconButton({
    label,
    onClick,
    children,
    variant = "default",
}: {
    label: string;
    onClick: () => void;
    children: React.ReactNode;
    variant?: "default" | "danger";
}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onClick}
                    aria-label={label}
                    className={cn(
                        "size-6 hover:text-foreground",
                        variant === "danger" && "hover:text-destructive",
                    )}
                >
                    {children}
                </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
                {label}
            </TooltipContent>
        </Tooltip>
    );
}
