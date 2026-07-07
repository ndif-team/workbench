"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/stores/useWorkspace";
import { useModelsQuery } from "@/lib/api/modelsApi";
import { useWorkspaceWorkshop } from "@/lib/api/workshopApi";
import type { ModelStatus } from "@/types/models";
import { MODEL_STATUS, deriveHeat, splitRepo } from "@/components/model-selector/status";
import { ModelPopover } from "@/components/model-selector/ModelPopover";

// ----- status vocabularies ----------------------------------------------------------

type JobState = "received" | "queued" | "dispatched" | "running" | "completed" | "error";

const JOB_STATUS: Record<JobState, { color: string; label: string; active: boolean }> = {
    received: { color: "hsl(270 70% 55%)", label: "received", active: true },
    queued: { color: "hsl(38 92% 50%)", label: "queued", active: true },
    dispatched: { color: "hsl(43 95% 45%)", label: "dispatched", active: true },
    running: { color: "hsl(217 91% 60%)", label: "running", active: true },
    completed: { color: "hsl(142 71% 45%)", label: "completed", active: false },
    error: { color: "hsl(0 84% 60%)", label: "error", active: false },
};

// ----- helpers --------------------------------------------------------------------

interface ParsedJob {
    state: JobState;
    count?: number;
}

const parseJobStatus = (raw: string): ParsedJob | null => {
    if (!raw) return null;
    const [head, tail] = raw.split(":");
    const key = head.trim().toLowerCase();
    if (!(key in JOB_STATUS)) return null;
    const state = key as JobState;
    if (tail) {
        const match = tail.match(/\d+/);
        if (match) return { state, count: parseInt(match[0], 10) };
    }
    return { state };
};

// Brand wash applied to the trigger root.
const TRIGGER_CLASSES = cn(
    "inline-flex items-center gap-2 h-8 px-1 rounded-md cursor-pointer",
    "bg-gradient-to-r from-primary/[0.06] to-purple-500/[0.04]",
    "border border-primary/20 text-foreground text-sm",
    "transition-colors",
    "hover:from-primary/[0.10] hover:to-purple-500/[0.07] hover:border-primary/30",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "data-[state=open]:from-primary/[0.10] data-[state=open]:to-purple-500/[0.07] data-[state=open]:border-primary/30",
    "disabled:opacity-60 disabled:cursor-not-allowed",
);

const BADGE_CLASSES = cn(
    "inline-flex items-center gap-1.5 h-6 px-2 rounded-sm shrink-0",
    "text-xs font-semibold uppercase tracking-wide",
);

// ----- component ------------------------------------------------------------------

interface ModelControlProps {
    className?: string;
}

export function ModelControl({ className }: ModelControlProps) {
    const { selectedModelIdx, setSelectedModelIdx, jobStatus } = useWorkspace();
    const { workspaceId } = useParams<{ workspaceId?: string }>();

    const { data: models, isLoading: modelsLoading, isError: modelsError } = useModelsQuery();

    // Workshop workspaces pin the workshop's model: the selection is forced
    // and the picker popover is replaced with a locked pill. While the lookup
    // is in flight we show the loading pill rather than the unlocked picker,
    // so a participant never gets a window to change the model.
    const { data: workshop, isLoading: workshopLoading } = useWorkspaceWorkshop(workspaceId);

    const [open, setOpen] = React.useState(false);

    // Computed before the early returns so the useEffect below is called on
    // every render (Rules of Hooks).
    const job = parseJobStatus(jobStatus);
    const isJobActive = job ? JOB_STATUS[job.state].active : false;

    // Close the popover if a job kicks off while it's open.
    React.useEffect(() => {
        if (isJobActive && open) setOpen(false);
    }, [isJobActive, open]);

    // Apply the workshop's model. When the workshop locks the model we enforce
    // it on every render (the picker is a locked pill below, but other surfaces
    // share the same store). When the workshop allows changes, its model is only
    // the participant's default: seed it once, then leave their choice alone.
    const defaultAppliedRef = React.useRef(false);
    React.useEffect(() => {
        if (!workshop || !models || models.length === 0) return;
        const idx = models.findIndex((m) => m.name === workshop.model);
        if (idx === -1) return;
        if (workshop.allowModelChange) {
            if (defaultAppliedRef.current) return;
            defaultAppliedRef.current = true;
        }
        if (idx !== selectedModelIdx) setSelectedModelIdx(idx);
    }, [workshop, models, selectedModelIdx, setSelectedModelIdx]);

    const handleSelect = (name: string) => {
        if (!models) return;
        const idx = models.findIndex((m) => m.name === name);
        if (idx !== -1) setSelectedModelIdx(idx);
        setOpen(false);
    };

    // Loading: explicit fetch indicator inside the same brand-wash pill.
    // Includes the workshop lookup — see the pinning note above.
    if ((modelsLoading && !models) || workshopLoading) {
        return (
            <div
                role="status"
                aria-live="polite"
                aria-label="Fetching models"
                className={cn(
                    "inline-flex items-center gap-2 h-8 px-3 rounded-md",
                    "bg-gradient-to-r from-primary/[0.06] to-purple-500/[0.04]",
                    "border border-primary/20 text-sm text-muted-foreground",
                    className,
                )}
            >
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden />
                <span>Fetching models…</span>
            </div>
        );
    }

    // Error / empty fallback — same pill shape, unavailable heat, disabled.
    if (modelsError || !models || models.length === 0) {
        const reason = modelsError ? "Backend unreachable" : "No models available";
        return (
            <Tooltip>
                <TooltipTrigger asChild>
                    <div
                        role="group"
                        aria-disabled
                        aria-label="System control unavailable"
                        className={cn(
                            "inline-flex items-center gap-2 h-8 px-1 rounded-md cursor-not-allowed",
                            "bg-gradient-to-r from-primary/[0.06] to-purple-500/[0.04]",
                            "border border-primary/20 opacity-70",
                            className,
                        )}
                    >
                        <HeatBadge heat="unavailable" />
                        <span className="text-xs px-1 text-muted-foreground">no model</span>
                    </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">{reason}</TooltipContent>
            </Tooltip>
        );
    }

    const selectedModel = models[selectedModelIdx] ?? models[0];
    const heat = deriveHeat(selectedModel);
    const display = splitRepo(selectedModel.name);

    // Locked pill for workshop workspaces that pin their model — same shape, no
    // popover trigger. Workshops that allow model changes fall through to the
    // normal picker below (seeded to the workshop's model as the default).
    if (workshop && !workshop.allowModelChange) {
        return (
            <Tooltip>
                <TooltipTrigger asChild>
                    <div
                        role="group"
                        aria-disabled
                        aria-label="Model is set by the workshop"
                        className={cn(TRIGGER_CLASSES, "max-w-[28rem] cursor-default", className)}
                    >
                        <HeatBadge heat={heat} />
                        <span
                            className="font-mono text-xs px-0.5 truncate min-w-0 text-foreground"
                            title={selectedModel.name}
                        >
                            {display.label}
                        </span>
                        {job && (
                            <>
                                <span aria-hidden className="w-px h-[18px] bg-border shrink-0" />
                                <JobBadge state={job.state} count={job.count} />
                            </>
                        )}
                    </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">Model is set by the workshop</TooltipContent>
            </Tooltip>
        );
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    data-testid="model-select-trigger"
                    aria-label={
                        isJobActive
                            ? "Model selection disabled while a job is running"
                            : "Select model"
                    }
                    disabled={isJobActive}
                    className={cn(TRIGGER_CLASSES, "max-w-[28rem]", className)}
                >
                    <HeatBadge heat={heat} />
                    <span
                        className="font-mono text-xs px-0.5 truncate min-w-0 text-foreground"
                        title={selectedModel.name}
                    >
                        {display.label}
                    </span>
                    <ChevronDown className="w-3 h-3 opacity-50 shrink-0" />
                    {job && (
                        <>
                            <span aria-hidden className="w-px h-[18px] bg-border shrink-0" />
                            <JobBadge state={job.state} count={job.count} />
                        </>
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                side="bottom"
                // Never flip up — the menu caps to the room below (the shell
                // reads --radix-popover-content-available-height) and scrolls.
                avoidCollisions={false}
                collisionPadding={8}
                sideOffset={6}
                style={{ maxHeight: "var(--radix-popover-content-available-height)" }}
                className="p-0 border-0 bg-transparent shadow-none w-auto"
            >
                <ModelPopover
                    models={models}
                    selectedName={selectedModel.name}
                    onSelect={handleSelect}
                    selectableOnly
                />
            </PopoverContent>
        </Popover>
    );
}

// ----- badges ---------------------------------------------------------------------

function HeatBadge({ heat }: { heat: ModelStatus }) {
    const m = MODEL_STATUS[heat];
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span
                    className={BADGE_CLASSES}
                    style={{
                        backgroundColor: `color-mix(in oklab, ${m.color} 12%, transparent)`,
                        color: m.color,
                    }}
                >
                    <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: m.color }}
                    />
                    {m.label}
                </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">{m.detail}</TooltipContent>
        </Tooltip>
    );
}

function JobBadge({ state, count }: { state: JobState; count?: number }) {
    const j = JOB_STATUS[state];
    // Active states get an animated sweep on top of a directional gradient base.
    // Terminal states (completed, error) keep the same directional gradient but no sweep.
    const isActive = j.active;
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span
                    role="status"
                    aria-live="polite"
                    aria-label={`Job ${j.label}${count != null ? ` ${count}` : ""}`}
                    className={cn(BADGE_CLASSES, "relative overflow-hidden")}
                    style={{
                        backgroundImage: `linear-gradient(90deg, color-mix(in oklab, ${j.color} 6%, transparent) 0%, color-mix(in oklab, ${j.color} 22%, transparent) 100%)`,
                        color: j.color,
                    }}
                >
                    {isActive && (
                        <span
                            aria-hidden
                            className="pointer-events-none absolute inset-0 -translate-x-full animate-shimmer-fast"
                            style={{
                                backgroundImage: `linear-gradient(90deg, transparent, color-mix(in oklab, ${j.color} 32%, transparent), transparent)`,
                            }}
                        />
                    )}
                    <span className="relative inline-flex items-center gap-1.5">
                        {j.label}
                        {count != null && (
                            <>
                                <span className="opacity-50">·</span>
                                <span className="font-bold">{count}</span>
                            </>
                        )}
                    </span>
                </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
                {state === "queued" && count != null
                    ? `Queued behind ${count} job${count === 1 ? "" : "s"}`
                    : state === "error"
                      ? "Job failed"
                      : state === "completed"
                        ? "Job completed"
                        : `Job ${j.label}`}
            </TooltipContent>
        </Tooltip>
    );
}
