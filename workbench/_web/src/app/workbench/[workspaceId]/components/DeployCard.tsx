"use client";

import { type MouseEvent } from "react";
import { AlertTriangle, Cloud, MoreVertical, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { splitRepo } from "@/components/model-selector/status";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { sidebarCardBase } from "./sidebarCardShell";

/** Mirrors the three states of the chart's <ModelDeployingPanel>:
 *  - "cold"      — model not deployed (idle); the panel offers a Deploy button
 *  - "deploying" — warmup in flight
 *  - "failed"    — warmup errored; the panel offers Retry
 */
export type DeployCardState = "cold" | "deploying" | "failed";

interface DeployCardProps {
    model: string;
    state: DeployCardState;
    /** True when this is the active chart (its panel is open). */
    selected?: boolean;
    /** Navigate to the chart this deploy belongs to (where it can be deployed/retried). */
    onClick?: () => void;
    /** When provided, the card exposes a Delete action — for clearing a
     * placeholder chart whose model never deployed or failed to deploy. */
    onDelete?: (e: MouseEvent) => void;
}

/**
 * The sidebar row for a chart whose model isn't runnable yet. It stands in for
 * the chart's normal card and tracks the same state the chart page shows, so
 * the two never disagree (e.g. after a reload, when the deployment store has
 * been cleared and the model reads as plain cold). Deliberately quiet — the
 * model name is the hero; status lives in the fill, selection upgrades the
 * border to primary (the two channels never collide).
 */
export function DeployCard({ model, state, selected = false, onClick, onDelete }: DeployCardProps) {
    const fill =
        state === "failed"
            ? "bg-destructive/5"
            : state === "deploying" || selected
              ? "bg-primary/[0.04]"
              : "bg-secondary/80 dark:bg-secondary/50";
    const idleBorder =
        state === "failed"
            ? "border-destructive/40"
            : state === "deploying"
              ? "border-primary/30"
              : "border-border";

    return (
        <div
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            onClick={onClick}
            onKeyDown={(e) => {
                if (onClick && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onClick();
                }
            }}
            className={cn(
                sidebarCardBase,
                "cursor-pointer",
                fill,
                selected ? "border-primary ring-1 ring-inset ring-primary" : idleBorder,
            )}
        >
            <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-sm font-medium text-foreground">
                    {splitRepo(model).label}
                </span>
                {onDelete && (
                    <Popover>
                        <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <button
                                type="button"
                                aria-label="Deployment actions"
                                className="-m-0.5 shrink-0 rounded p-0.5 text-muted-foreground/40 transition-colors hover:bg-accent hover:text-foreground focus-visible:text-foreground group-hover:text-muted-foreground"
                            >
                                <MoreVertical className="h-3.5 w-3.5" />
                            </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-40 p-1" align="end">
                            <button
                                className="flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-sm text-destructive hover:bg-accent"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete(e);
                                }}
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>Delete</span>
                            </button>
                        </PopoverContent>
                    </Popover>
                )}
            </div>
            <span
                aria-live="polite"
                className={cn(
                    "flex items-center gap-1.5 text-xs",
                    state === "failed" ? "font-medium text-destructive" : "text-muted-foreground",
                )}
            >
                {state === "failed" ? (
                    <>
                        <AlertTriangle aria-hidden className="size-3 shrink-0" />
                        Deployment failed
                    </>
                ) : state === "deploying" ? (
                    <>
                        <span
                            aria-hidden
                            className="brand-spinner inline-block size-3 shrink-0 motion-safe:animate-spin [animation-duration:1.4s]"
                        />
                        Deploying
                    </>
                ) : (
                    <>
                        <Cloud aria-hidden className="size-3 shrink-0" />
                        Not deployed
                    </>
                )}
            </span>
        </div>
    );
}
