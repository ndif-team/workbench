"use client";

import * as React from "react";
import { Check, ChevronDown, Loader2, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/stores/useWorkspace";
import { getModels } from "@/lib/api/modelsApi";
import { queryKeys } from "@/lib/queryKeys";
import type { Model, ModelStatus } from "@/types/models";

// ----- status vocabularies ----------------------------------------------------------

const MODEL_STATUS: Record<
    ModelStatus,
    { color: string; label: string; detail: string }
> = {
    hot: { color: "hsl(142 71% 45%)", label: "hot", detail: "loaded · ready to run" },
    warm: { color: "hsl(38 92% 50%)", label: "warm", detail: "cached · warming up" },
    cold: { color: "hsl(217 91% 60%)", label: "cold", detail: "on disk · cold start" },
    gated: { color: "hsl(270 70% 55%)", label: "gated", detail: "sign in to access" },
    unavailable: {
        color: "hsl(0 84% 60%)",
        label: "unavailable",
        detail: "not deployed",
    },
    unknown: {
        color: "hsl(var(--muted-foreground))",
        label: "unknown",
        detail: "status unavailable",
    },
};

type JobState =
    | "received"
    | "queued"
    | "dispatched"
    | "running"
    | "completed"
    | "error";

const JOB_STATUS: Record<
    JobState,
    { color: string; label: string; active: boolean }
> = {
    received: { color: "hsl(270 70% 55%)", label: "received", active: true },
    queued: { color: "hsl(38 92% 50%)", label: "queued", active: true },
    dispatched: { color: "hsl(48 96% 53%)", label: "dispatched", active: true },
    running: { color: "hsl(217 91% 60%)", label: "running", active: true },
    completed: { color: "hsl(142 71% 45%)", label: "completed", active: false },
    error: { color: "hsl(0 84% 60%)", label: "error", active: false },
};

// ----- helpers --------------------------------------------------------------------

const splitRepo = (
    name: string,
): { org: string; label: string } => {
    const slash = name.lastIndexOf("/");
    if (slash === -1) return { org: "", label: name };
    return { org: name.slice(0, slash), label: name.slice(slash + 1) };
};

const deriveHeat = (model: Model | undefined): ModelStatus => {
    if (!model) return "unknown";
    if (model.status) return model.status;
    if (!model.allowed && model.gated) return "gated";
    if (!model.allowed) return "unavailable";
    return "unknown";
};

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

    const {
        data: models,
        isLoading: modelsLoading,
        isError: modelsError,
    } = useQuery({
        queryKey: queryKeys.models.all,
        queryFn: getModels,
        refetchInterval: 120000,
    });

    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");

    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        if (!next) setQuery("");
    };

    const handleSelect = (name: string) => {
        if (!models) return;
        const idx = models.findIndex((m) => m.name === name);
        if (idx !== -1) setSelectedModelIdx(idx);
        setOpen(false);
        setQuery("");
    };

    // Loading: explicit fetch indicator inside the same brand-wash pill.
    if (modelsLoading && !models) {
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
                <Loader2
                    className="w-3.5 h-3.5 animate-spin shrink-0"
                    aria-hidden
                />
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
                        <span className="text-xs px-1 text-muted-foreground">
                            no model
                        </span>
                    </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">{reason}</TooltipContent>
            </Tooltip>
        );
    }

    const selectedModel = models[selectedModelIdx] ?? models[0];
    const heat = deriveHeat(selectedModel);
    const display = splitRepo(selectedModel.name);
    const job = parseJobStatus(jobStatus);

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label="Select model"
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
                            <span
                                aria-hidden
                                className="w-px h-[18px] bg-border shrink-0"
                            />
                            <JobBadge state={job.state} count={job.count} />
                        </>
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                sideOffset={6}
                className="p-0 border-0 bg-transparent shadow-none w-auto"
            >
                <ModelPopover
                    models={models}
                    selectedName={selectedModel.name}
                    onSelect={handleSelect}
                    query={query}
                    onQueryChange={setQuery}
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

// ----- popover --------------------------------------------------------------------

interface ModelPopoverProps {
    models: Model[];
    selectedName: string;
    onSelect: (name: string) => void;
    query: string;
    onQueryChange: (q: string) => void;
}

function ModelPopover({
    models,
    selectedName,
    onSelect,
    query,
    onQueryChange,
}: ModelPopoverProps) {
    // Filter (case-insensitive substring on name + org) and sort alphabetically within each group.
    const { base, chat, flat } = React.useMemo(() => {
        const q = query.trim().toLowerCase();
        const matches = (m: Model) => {
            if (!q) return true;
            const { org, label } = splitRepo(m.name);
            return (
                label.toLowerCase().includes(q) || org.toLowerCase().includes(q)
            );
        };
        const sortByLabel = (a: Model, b: Model) =>
            splitRepo(a.name).label.localeCompare(splitRepo(b.name).label);
        const base = models.filter((m) => !m.is_chat && matches(m)).sort(sortByLabel);
        const chat = models.filter((m) => m.is_chat && matches(m)).sort(sortByLabel);
        return { base, chat, flat: [...base, ...chat] };
    }, [models, query]);

    const [active, setActive] = React.useState(0);
    const rowRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

    // Reset highlight whenever the filter changes or models reflow.
    React.useEffect(() => {
        if (flat.length === 0) {
            setActive(0);
            return;
        }
        const selectedIdx = flat.findIndex((m) => m.name === selectedName);
        setActive(selectedIdx === -1 ? 0 : selectedIdx);
        // We intentionally only reset on query change, not on selectedName.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query]);

    React.useEffect(() => {
        rowRefs.current[active]?.scrollIntoView({ block: "nearest" });
    }, [active]);

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (flat.length > 0) setActive((a) => (a + 1) % flat.length);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (flat.length > 0)
                setActive((a) => (a - 1 + flat.length) % flat.length);
        } else if (e.key === "Enter") {
            e.preventDefault();
            const target = flat[active];
            if (target) onSelect(target.name);
        }
        // esc is handled by Radix Popover.
    };

    return (
        <div
            onKeyDown={onKeyDown}
            className={cn(
                "w-[380px] bg-popover text-popover-foreground border rounded-md overflow-hidden text-sm",
                "shadow-[0_12px_28px_hsl(0_0%_0%_/_0.10)]",
            )}
        >
            {/* Search */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b">
                <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <input
                    autoFocus
                    value={query}
                    onChange={(e) => onQueryChange(e.target.value)}
                    placeholder="Search models…"
                    aria-label="Search models"
                    className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground min-w-0"
                />
                <kbd
                    className={cn(
                        "text-xs px-1.5 py-0.5 border rounded font-mono",
                        "text-muted-foreground shrink-0",
                    )}
                >
                    esc
                </kbd>
            </div>

            {/* Groups */}
            <div role="menu" className="max-h-[60vh] overflow-y-auto">
                {flat.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground text-sm px-3">
                        No models match &ldquo;{query}&rdquo;.
                    </div>
                ) : (
                    <>
                        {base.length > 0 && (
                            <Group
                                title="Base"
                                count={base.length}
                                rows={base}
                                selectedName={selectedName}
                                activeName={flat[active]?.name}
                                onSelect={onSelect}
                                onHoverByIdx={setActive}
                                rowRefs={rowRefs}
                                flat={flat}
                            />
                        )}
                        {chat.length > 0 && (
                            <Group
                                title="Chat"
                                count={chat.length}
                                rows={chat}
                                selectedName={selectedName}
                                activeName={flat[active]?.name}
                                onSelect={onSelect}
                                onHoverByIdx={setActive}
                                rowRefs={rowRefs}
                                flat={flat}
                            />
                        )}
                    </>
                )}
            </div>

        </div>
    );
}

function Group({
    title,
    count,
    rows,
    selectedName,
    activeName,
    onSelect,
    onHoverByIdx,
    rowRefs,
    flat,
}: {
    title: string;
    count: number;
    rows: Model[];
    selectedName: string;
    activeName: string | undefined;
    onSelect: (name: string) => void;
    onHoverByIdx: (idx: number) => void;
    rowRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>;
    flat: Model[];
}) {
    return (
        <>
            <div className="flex items-baseline gap-2 pt-2.5 pb-1 px-3">
                <span className="text-xs font-medium text-muted-foreground">
                    {title}
                </span>
                <span className="text-xs text-muted-foreground/70">
                    {count}
                </span>
            </div>
            {rows.map((m) => {
                const flatIdx = flat.findIndex((f) => f.name === m.name);
                return (
                    <Row
                        key={m.name}
                        model={m}
                        selected={m.name === selectedName}
                        active={m.name === activeName}
                        onSelect={() => onSelect(m.name)}
                        onHover={() => onHoverByIdx(flatIdx)}
                        ref={(el) => {
                            rowRefs.current[flatIdx] = el;
                        }}
                    />
                );
            })}
        </>
    );
}

interface RowProps {
    model: Model;
    selected: boolean;
    active: boolean;
    onSelect: () => void;
    onHover: () => void;
}

const Row = React.forwardRef<HTMLButtonElement, RowProps>(function Row(
    { model, selected, active, onSelect, onHover },
    ref,
) {
    const { org, label } = splitRepo(model.name);
    const heat = deriveHeat(model);
    const meta = MODEL_STATUS[heat];
    const muted = heat === "gated" || heat === "unavailable";

    return (
        <button
            ref={ref}
            type="button"
            role="menuitem"
            aria-current={selected ? "true" : undefined}
            onClick={onSelect}
            onMouseEnter={onHover}
            onFocus={onHover}
            className={cn(
                "w-full grid items-center gap-2.5 py-1.5 text-left cursor-pointer outline-none",
                "grid-cols-[10px_1fr_auto]",
                selected
                    ? "bg-primary/[0.06] border-l-2 border-primary pl-[10px] pr-3"
                    : cn(
                          "border-l-2 border-transparent px-3",
                          active && "bg-accent",
                      ),
                muted && "opacity-70",
            )}
        >
            <span
                className="w-2 h-2 rounded-full"
                style={{
                    backgroundColor: meta.color,
                    boxShadow: `0 0 0 3px color-mix(in oklab, ${meta.color} 13%, transparent)`,
                }}
            />
            <span className="flex items-baseline gap-2 min-w-0">
                <span
                    className={cn(
                        "font-mono text-xs truncate",
                        selected ? "font-semibold" : "font-medium",
                        muted ? "text-muted-foreground" : "text-foreground",
                    )}
                >
                    {label}
                </span>
                {org && (
                    <span className="text-xs text-muted-foreground truncate">
                        {org}
                    </span>
                )}
            </span>
            <span
                className="text-xs font-semibold uppercase tracking-wide inline-flex items-center"
                style={{ color: selected ? "hsl(var(--primary))" : meta.color }}
            >
                {selected ? <Check className="w-3 h-3" /> : meta.label}
            </span>
        </button>
    );
});

