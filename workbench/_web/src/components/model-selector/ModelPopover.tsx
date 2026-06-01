"use client";

import * as React from "react";
import { Check, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { MODEL_STATUS, deriveHeat } from "@/components/model-selector/status";
import type { Model, ModelStatus } from "@/types/models";

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

const splitRepo = (name: string): { org: string; label: string } => {
    const slash = name.lastIndexOf("/");
    if (slash === -1) return { org: "", label: name };
    return { org: name.slice(0, slash), label: name.slice(slash + 1) };
};

interface ModelPopoverProps {
    models: Model[];
    selectedName: string;
    onSelect: (name: string) => void;
    query: string;
    onQueryChange: (q: string) => void;
    /** Optional content rendered below the model groups, separated by a
     * border. Used on the landing page to point users to the full workspace
     * catalog. */
    footer?: React.ReactNode;
    /** When false, the search input is hidden — `query` stays empty so the
     * full list shows. Useful on surfaces with a small pre-filtered model
     * set (e.g. the landing page only-hot popover). Defaults to true. */
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
    query,
    onQueryChange,
    footer,
    showSearch = true,
    compact = false,
}: ModelPopoverProps) {
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
        const HEAT_ORDER: ModelStatus[] = [
            "hot",
            "warm",
            "cold",
            "unknown",
            "gated",
            "unavailable",
        ];
        const heatRank = (m: Model) => {
            const h = deriveHeat(m);
            const i = HEAT_ORDER.indexOf(h);
            return i === -1 ? HEAT_ORDER.length : i;
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
        // esc is handled by the host Popover.
    };

    // Compact-mode background: an opaque brand-tinted gradient (the primary
    // and purple are *baked* into the popover color via color-mix so each
    // stop is solid). Done as an inline style to avoid tailwind-merge
    // collapsing `bg-popover` and `bg-gradient-to-b` into a single class.
    const compactBg = compact
        ? {
              background: [
                  "linear-gradient(",
                  "to bottom,",
                  "color-mix(in oklab, hsl(var(--primary)) 8%, hsl(var(--popover))),",
                  "color-mix(in oklab, rgb(168 85 247) 8%, hsl(var(--popover)))",
                  ")",
              ].join(" "),
          }
        : undefined;

    return (
        <div
            onKeyDown={onKeyDown}
            style={compactBg}
            className={cn(
                "text-popover-foreground border overflow-hidden text-sm",
                compact
                    ? cn(
                          "w-[260px] rounded-2xl border-primary/15",
                          "shadow-[0_16px_40px_-12px_hsl(var(--primary)/0.18),0_4px_12px_-2px_hsl(0_0%_0%/0.05)]",
                      )
                    : cn(
                          "w-[380px] rounded-md bg-popover",
                          "shadow-[0_12px_28px_hsl(0_0%_0%_/_0.10)]",
                      ),
            )}
        >
            {/* Search */}
            {showSearch && (
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
                                onHoverByIdx={setActive}
                                rowRefs={rowRefs}
                                flat={flat}
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
                                onHoverByIdx={setActive}
                                rowRefs={rowRefs}
                                flat={flat}
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
    onHoverByIdx,
    rowRefs,
    flat,
    compact,
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
                            compact={compact}
                            ref={(el) => {
                                rowRefs.current[flatIdx] = el;
                            }}
                        />
                    );
                })}
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
                    <Check className={compact ? "w-3 h-3" : "w-3 h-3"} />
                ) : compact ? null : (
                    <span className="text-xs font-semibold uppercase tracking-wide">
                        {meta.label}
                    </span>
                )}
            </span>
        </button>
    );
});
