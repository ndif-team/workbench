"use client";

import { Fragment } from "react";
import { Info } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import type { GenerationParams } from "@/types/generation";

interface GenerationParamsInfoProps {
    model: string;
    params: GenerationParams;
    createdAt: number;
}

/**
 * Hover (or keyboard-focus) the info icon to see the parameters a specific
 * generation actually ran with — a clean popover-surface card via shadcn's
 * HoverCard. Replaces the old bottom "Custom" footnote.
 */
export function GenerationParamsInfo({ model, params, createdAt }: GenerationParamsInfoProps) {
    const rows = buildRows(model, params, createdAt);
    return (
        <HoverCard openDelay={120} closeDelay={80}>
            <HoverCardTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Generation parameters"
                    className="size-6 hover:text-foreground"
                >
                    <Info className="size-3" />
                </Button>
            </HoverCardTrigger>
            <HoverCardContent side="top" align="end" className="w-56 p-3">
                <p className="text-xs font-medium">Parameters</p>
                <dl className="mt-2 grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 text-xs">
                    {rows.map(([label, value]) => (
                        <Fragment key={label}>
                            <dt className="text-muted-foreground">{label}</dt>
                            <dd className="break-all text-right font-mono tabular-nums text-foreground">
                                {value}
                            </dd>
                        </Fragment>
                    ))}
                </dl>
            </HoverCardContent>
        </HoverCard>
    );
}

function buildRows(model: string, params: GenerationParams, createdAt: number): [string, string][] {
    const slash = model.lastIndexOf("/");
    const modelLabel = slash >= 0 ? model.slice(slash + 1) : model;

    const rows: [string, string][] = [
        ["Model", modelLabel],
        ["Max tokens", String(params.maxNewTokens)],
        ["Decoding", params.sampling ? "sampling" : "greedy"],
    ];
    if (params.sampling) {
        rows.push(["Temperature", params.temperature.toFixed(2)]);
        rows.push(["Top-p", params.topP.toFixed(2)]);
        rows.push(["Top-k", params.topK > 0 ? String(params.topK) : "off"]);
    }
    if (params.stopSequences.length > 0) {
        rows.push(["Stop", params.stopSequences.map((s) => JSON.stringify(s)).join("  ")]);
    }
    rows.push([
        "Created",
        new Date(createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    ]);
    return rows;
}
