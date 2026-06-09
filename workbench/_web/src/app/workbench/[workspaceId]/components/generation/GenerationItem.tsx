"use client";

import { useEffect, useState } from "react";
import { Copy, Check, Trash2, AlertTriangle, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { GenerationItem as GenerationItemType, GenerationViewMode } from "@/types/generation";
import { GenerationContentView } from "./GenerationContentView";
import { GenerationParamsInfo } from "./GenerationParamsInfo";

interface GenerationItemProps {
    item: GenerationItemType;
    isActive: boolean;
    viewMode: GenerationViewMode;
    onRemove: () => void;
    onRegenerate?: () => void;
}

export function GenerationItem({
    item,
    isActive,
    viewMode,
    onRemove,
    onRegenerate,
}: GenerationItemProps) {
    const isPending = item.status === "pending";
    const isError = item.status === "error";

    const generatedText =
        item.output && item.output.startsWith(item.prompt)
            ? item.output.slice(item.prompt.length)
            : (item.output ?? "");

    return (
        <article
            aria-live={isActive ? "polite" : undefined}
            className={cn(
                "group animate-in fade-in rounded-md border p-2.5 transition-colors duration-200",
                isPending
                    ? "border-primary"
                    : isError
                      ? "border-destructive/60"
                      : isActive
                        ? "border-primary/60"
                        : "border-border",
            )}
        >
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
                <div className="flex items-center gap-0.5 text-muted-foreground/40 transition-colors focus-within:text-muted-foreground group-hover:text-muted-foreground">
                    {!isPending && item.output && <CopyButton text={item.output} label="Copy" />}
                    {!isPending && (
                        <GenerationParamsInfo
                            model={item.model}
                            params={item.params}
                            createdAt={item.createdAt}
                        />
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

            {isPending ? (
                <SeedAndOutput prompt={item.prompt}>
                    <PendingOutput />
                </SeedAndOutput>
            ) : isError ? (
                <SeedAndOutput prompt={item.prompt}>
                    <ErrorOutput message={item.error ?? "Generation failed."} />
                </SeedAndOutput>
            ) : (
                <GenerationContentView
                    prompt={item.prompt}
                    generated={generatedText}
                    model={item.model}
                    seedTokens={item.seedTokens}
                    completionTokens={item.completionTokens}
                    viewMode={viewMode}
                />
            )}
        </article>
    );
}

/** Seed (muted, the start of the text) + a custom output block — shared by
 * pending/error so the prompt flows straight into its loading/error state. */
function SeedAndOutput({ prompt, children }: { prompt: string; children: React.ReactNode }) {
    return (
        <div className="min-w-0">
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-muted-foreground">
                {prompt}
            </pre>
            <div className="mt-1.5">{children}</div>
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
