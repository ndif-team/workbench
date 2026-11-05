"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { show, type Value } from "@/lib/algorithmHypothesis/primitives";
import { EXAMPLE_PROMPTS, tokenizeAbstract } from "@/lib/algorithmHypothesis/grids";
import { useModelTokens } from "@/lib/api/algorithmApi";

/** Source and target inputs, shared by the intervention and sweep views. */

export type Role = "source" | "target";

/** A prompt's tokens: the model's tokenizer for model grids, words otherwise. */
export function useTokens(
    model: string | undefined,
    text: string,
): { tokens: string[]; loading: boolean } {
    const q = useModelTokens(model, text);
    const abstract = useMemo(() => tokenizeAbstract(text), [text]);
    if (!model) return { tokens: abstract, loading: false };
    return { tokens: q.data ?? [], loading: q.isLoading };
}

export const ROLE_DOT: Record<"source" | "target" | "counterfactual", string> = {
    source: "bg-cyan-500",
    target: "bg-pink-500",
    counterfactual: "bg-purple-600 dark:bg-purple-400",
};

export function InputRow({
    role,
    value,
    saved,
    onChange,
    onSave,
    extra,
}: {
    role: Role;
    value: string;
    saved: string[];
    onChange: (text: string) => void;
    onSave: (text: string) => void;
    extra?: React.ReactNode;
}) {
    // Like the editor's prompt: applied on Enter or blur, not per keystroke.
    const [text, setText] = useState(value);
    useEffect(() => setText(value), [value]);
    const commit = () => {
        if (text !== value) onChange(text);
    };
    const label = role === "source" ? "Source" : "Target";
    return (
        <div className="flex items-center gap-2">
            <span className="flex w-16 shrink-0 items-center gap-1.5 text-sm font-medium">
                <span className={cn("size-2 rounded-full", ROLE_DOT[role])} aria-hidden="true" />
                {label}
            </span>
            <Input
                aria-label={`${label} input`}
                className="min-w-48 flex-1 font-mono"
                value={text}
                spellCheck={false}
                onChange={(e) => setText(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === "Enter") commit();
                }}
            />
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="outline"
                        size="sm"
                        aria-label={`Saved and example prompts for the ${role}`}
                    >
                        Inputs
                        <ChevronDown />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-w-[28rem]">
                    {saved.length > 0 && (
                        <>
                            <DropdownMenuLabel>Saved with this algorithm</DropdownMenuLabel>
                            {saved.map((s) => (
                                <DropdownMenuItem
                                    key={`saved-${s}`}
                                    className="font-mono text-xs"
                                    onSelect={() => onChange(s)}
                                >
                                    <span className="truncate">{s}</span>
                                </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                        </>
                    )}
                    <DropdownMenuLabel>Examples</DropdownMenuLabel>
                    {EXAMPLE_PROMPTS.map((p) => (
                        <DropdownMenuItem key={p.text} onSelect={() => onChange(p.text)}>
                            {p.label}
                        </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        disabled={!value.trim() || saved.includes(value)}
                        onSelect={() => onSave(value)}
                    >
                        Save this {role} with the algorithm
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            {extra}
        </div>
    );
}

export function GridHeading({
    role,
    label,
    text,
    output,
}: {
    role: "source" | "target" | "counterfactual";
    label: string;
    text: string;
    output: Value | undefined;
}) {
    return (
        // Sticky, so the heading stays in view when the grids scroll sideways.
        <div className="sticky left-0 flex w-fit max-w-full min-w-0 items-center gap-2 px-3 pt-3 text-xs">
            <span
                className={cn("size-2 shrink-0 rounded-full", ROLE_DOT[role])}
                aria-hidden="true"
            />
            <span className="text-sm font-medium">{label}</span>
            <span
                className={cn(
                    "max-w-[36rem] truncate text-muted-foreground",
                    role !== "counterfactual" && "font-mono",
                )}
            >
                {text}
            </span>
            {output !== undefined && (
                <span className="whitespace-nowrap text-muted-foreground">
                    output{" "}
                    <span
                        className={cn(
                            "font-mono text-foreground",
                            role === "counterfactual" && "text-purple-700 dark:text-purple-300",
                        )}
                    >
                        {show(output)}
                    </span>
                </span>
            )}
        </div>
    );
}
