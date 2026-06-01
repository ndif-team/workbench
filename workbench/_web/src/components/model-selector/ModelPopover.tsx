"use client";

import * as React from "react";
import { Check, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import {
    popoverMenuShellClass,
    popoverMenuShellStyle,
} from "@/components/ui/pill-popover";
import {
    MODEL_STATUS,
    deriveHeat,
    splitRepo,
    heatRank,
} from "@/components/model-selector/status";
import type { Model } from "@/types/models";

/**
 * Rich model picker body — search field + heat-sorted Base/Chat groups +
 * arrow-key navigation + bottom-fade overflow signal. Designed to be
 * dropped inside any Popover or floating container.
 *
 * Hosted by:
 * - `ModelControl` (workspace header)
 * - `ModelPillOrSelect` on the landing page
 *
 * Caller owns the open/close state; this component is pure content.
 */

interface ModelPopoverProps {
    models: Model[];
    selectedName: string;
    onSelect: (name: string) => void;
    /** Optional content rendered below the model groups, separated by a
     * border. Used on the landing page to point users to the full workspace
     * catalog. */
    footer?: React.ReactNode;
    /** When false, the search input is hidden. Useful on surfaces with a
     * small pre-filtered model set (e.g. the landing page only-hot popover).
     * Defaults to true. */
    showSearch?: boolean;
    /** Tighter dimensions + minimal row chrome (drops org and uppercase
     * heat label; the heat dot still encodes status). Use on the landing
     * popover where the model set is already small and pre-filtered. */
    compact?: boolean;
}

export function ModelPopover({
    models,
    selectedName,
    onSelect,
    footer,
    showSearch = true,
    compact = false,
}: ModelPopoverProps) {
    // Search query is owned internally; consumers that hide the search
    // (showSearch=false) don't need to thread dead state through.
    const [query, setQuery] = React.useState("");

    // Filter (case-insensitive substring on name + org) and sort by heat
    // within each group — hot first, then warm, cold, etc. The currently
    // selected model is pinned to the top of its group so users always see
    // where they are. Ties broken alphabetically.
    const { base, chat, flat } = React.useMemo(() => {
        const q = query.trim().toLowerCase();
        const matches = (m: Model) => {
            if (!q) return true;
            const { org, label } = splitRepo(m.name);
            return (
                label.toLowerCase().includes(q) || org.toLowerCase().includes(q)
            );
        };
        const compare = (a: Model, b: Model) => {
            if (a.name === selectedName) return -1;
            if (b.name === selectedName) return 1;
            return (
                heatRank(a) - heatRank(b) ||
                splitRepo(a.name).label.localeCompare(splitRepo(b.name).label)
            );
        };
        const base = models.filter((m) => !m.is_chat && matches(m)).sort(compare);
        const chat = models.filter((m) => m.is_chat && matches(m)).sort(compare);
        return { base, chat, flat: [...base, ...chat] };
    }, [models, query, selectedName]);

    // Track the highlighted row by model NAME, not index. When the list
    // re-sorts (e.g. selecting a model pins it to the top), the index of the
    // highlighted model changes — anchoring on the name keeps the cursor on
    // the same model rather than jumping to whatever now sits at that index.
    const [activeName, setActiveName] = React.useState<string | null>(null);
    const rowRefs = React.useRef<Map<string, HTMLButtonElement | null>>(new Map());

    const active = React.useMemo(() => {
        const i = flat.findIndex((m) => m.name === activeName);
        return i === -1 ? 0 : i;
    }, [flat, activeName]);

    // Reset highlight to the selected model whenever the filter changes.
    React.useEffect(() => {
        if (flat.length === 0) {
            setActiveName(null);
            return;
        }
        const selected = flat.find((m) => m.name === selectedName);
        setActiveName((selected ?? flat[0]).name);
        // Intentionally only resets on query change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query]);

    React.useEffect(() => {
        const name = flat[active]?.name;
        if (name) rowRefs.current.get(name)?.scrollIntoView({ block: "nearest" });
    }, [active, flat]);

    const moveActive = (delta: number) => {
        if (flat.length === 0) return;
        const next = (active + delta + flat.length) % flat.length;
        setActiveName(flat[next].name);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            moveActive(1);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            moveActive(-1);
        } else if (e.key === "Enter") {
            e.preventDefault();
            const target = flat[active];
            if (target) onSelect(target.name);
        }
        // esc is handled by the host Popover.
    };

    return (
        <div
            onKeyDown={onKeyDown}
            style={{ width: compact ? 260 : 380, ...popoverMenuShellStyle(compact) }}
            className={popoverMenuShellClass(compact)}
        >
            {/* Search */}
            {showSearch && (
                <div
                    className={cn(
                        "flex items-center gap-2 px-3 py-2.5 border-b",
                        compact && "border-primary/10",
                    )}
                >
                    <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
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
            )}

            {/* Groups — each scrolls independently inside its own per-section
                cap, sized to content. A short group doesn't claim space the
                long group could use; a long group scrolls within its own cap
                without pushing the other below the fold. */}
            <div role="menu" className="flex flex-col">
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
                                onHover={setActiveName}
                                rowRefs={rowRefs}
                                compact={compact}
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
                                onHover={setActiveName}
                                rowRefs={rowRefs}
                                compact={compact}
                            />
                        )}
                    </>
                )}
            </div>

            {footer && (
                <div className={cn("border-t", compact && "border-primary/10")}>{footer}</div>
            )}
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
    onHover,
    rowRefs,
    compact,
}: {
    title: string;
    count: number;
    rows: Model[];
    selectedName: string;
    activeName: string | undefined;
    onSelect: (name: string) => void;
    onHover: (name: string) => void;
    rowRefs: React.MutableRefObject<Map<string, HTMLButtonElement | null>>;
    compact: boolean;
}) {
    // Visible row budget — keep the popover compact and signal overflow via
    // a soft bottom mask when there's more below the fold.
    const VISIBLE_ROWS = compact ? 4 : 5;
    const hasOverflow = rows.length > VISIBLE_ROWS;
    const maskFade = compact ? 24 : 36;
    const fadeMask = hasOverflow
        ? `linear-gradient(to bottom, black 0%, black calc(100% - ${maskFade}px), transparent 100%)`
        : undefined;

    return (
        <section className="flex flex-col">
            <div
                className={cn(
                    "flex items-baseline gap-1.5 shrink-0",
                    compact ? "pt-1.5 pb-0.5 px-2" : "pt-2.5 pb-1 px-3",
                )}
            >
                <span
                    className={cn(
                        "font-medium text-muted-foreground",
                        compact ? "text-[10px] uppercase tracking-wide" : "text-xs",
                    )}
                >
                    {title}
                </span>
                <span
                    className={cn(
                        "text-muted-foreground/70 tabular-nums",
                        compact ? "text-[10px]" : "text-xs",
                    )}
                >
                    {count}
                </span>
            </div>
            <div
                className={cn(
                    "overflow-y-auto pb-1",
                    compact ? "max-h-[140px]" : "max-h-[180px]",
                )}
                style={
                    fadeMask
                        ? { maskImage: fadeMask, WebkitMaskImage: fadeMask }
                        : undefined
                }
            >
                {rows.map((m) => (
                    <Row
                        key={m.name}
                        model={m}
                        selected={m.name === selectedName}
                        active={m.name === activeName}
                        onSelect={() => onSelect(m.name)}
                        onHover={() => onHover(m.name)}
                        compact={compact}
                        ref={(el) => {
                            rowRefs.current.set(m.name, el);
                        }}
                    />
                ))}
            </div>
        </section>
    );
}

interface RowProps {
    model: Model;
    selected: boolean;
    active: boolean;
    onSelect: () => void;
    onHover: () => void;
    compact: boolean;
}

const Row = React.forwardRef<HTMLButtonElement, RowProps>(function Row(
    { model, selected, active, onSelect, onHover, compact },
    ref,
) {
    const { org, label } = splitRepo(model.name);
    const heat = deriveHeat(model);
    const meta = MODEL_STATUS[heat];
    const muted = heat === "gated" || heat === "unavailable";

    const padX = compact ? "px-2" : "px-3";
    const selectedPadL = compact ? "pl-[6px]" : "pl-[10px]";
    const selectedPadR = compact ? "pr-2" : "pr-3";

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
                "w-full grid items-center text-left cursor-pointer outline-none",
                compact
                    ? "gap-2 py-1 grid-cols-[8px_1fr_auto]"
                    : "gap-2.5 py-1.5 grid-cols-[10px_1fr_auto]",
                selected
                    ? cn(
                          "bg-primary/[0.06] border-l-2 border-primary",
                          selectedPadL,
                          selectedPadR,
                      )
                    : cn("border-l-2 border-transparent", padX),
                muted && "opacity-70",
            )}
        >
            <span
                className={cn("rounded-full", compact ? "w-1.5 h-1.5" : "w-2 h-2")}
                style={{
                    backgroundColor: meta.color,
                    boxShadow: `0 0 0 ${compact ? 2 : 3}px color-mix(in oklab, ${meta.color} 13%, transparent)`,
                }}
            />
            <span className="flex items-baseline gap-2 min-w-0">
                <span
                    className={cn(
                        "font-mono truncate",
                        compact ? "text-[11px]" : "text-xs",
                        selected ? "font-semibold" : "font-medium",
                        muted ? "text-muted-foreground" : "text-foreground",
                    )}
                >
                    {label}
                </span>
                {!compact && org && (
                    <span className="text-xs text-muted-foreground truncate">
                        {org}
                    </span>
                )}
            </span>
            {/* Compact mode drops the uppercase heat label; the dot color
                already encodes status. Only the check for the selected row
                remains visible at the end. */}
            <span
                className="inline-flex items-center"
                style={{ color: selected ? "hsl(var(--primary))" : meta.color }}
            >
                {selected ? (
                    <Check className="w-3 h-3" />
                ) : compact ? null : (
                    <span className="text-xs font-semibold uppercase tracking-wide">
                        {meta.label}
                    </span>
                )}
            </span>
        </button>
    );
});
