"use client";

import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * General-purpose pill-triggered popover menu, matching the aesthetic of the
 * model picker (`ModelPopover`): a compact rounded shell with an optional
 * soft brand-gradient background, optional search, optional grouping,
 * keyboard navigation, selected-row check, and a footer slot.
 *
 * Use it anywhere a small inline "pick one" control is needed — the landing
 * page's tool and workspace selectors, for example. For the model picker
 * specifically, `ModelPopover` stays bespoke (heat dots, base/chat groups).
 *
 * The shell styling helpers (`popoverMenuShellClass`, `popoverMenuShellStyle`)
 * are exported so other menus — including `ModelPopover` — render an
 * identical container.
 */

export interface PillPopoverOption {
    value: string;
    label: string;
    /** Muted secondary text shown after the label. */
    description?: string;
    /** Extra text folded into the search match (e.g. an org slug). */
    keywords?: string;
    /** Leading icon (mutually exclusive with `dotColor` in practice). */
    icon?: React.ReactNode;
    /** Leading status dot color (CSS color string). */
    dotColor?: string;
    /** Right-aligned content (badge, count, etc.). */
    trailing?: React.ReactNode;
    /** Optional group header this option sorts under. */
    group?: string;
    /** `primary` tints the row in the brand color (e.g. a "New …" action). */
    tone?: "default" | "primary";
    disabled?: boolean;
}

/** Container className for a popover menu shell. Compact mode = the rounder,
 * brand-tinted landing look; standard = the neutral workspace look. */
export function popoverMenuShellClass(compact: boolean): string {
    return cn(
        "text-popover-foreground border overflow-hidden text-sm",
        compact
            ? cn(
                  "rounded-2xl border-primary/15",
                  "shadow-[0_16px_40px_-12px_hsl(var(--primary)/0.18),0_4px_12px_-2px_hsl(0_0%_0%/0.05)]",
              )
            : cn("rounded-md bg-popover", "shadow-[0_12px_28px_hsl(0_0%_0%_/_0.10)]"),
    );
}

/** Inline background for the compact shell — an opaque brand-tinted gradient
 * (color-mix bakes the tint into the popover color so it stays readable).
 * Returns undefined for the standard shell (uses `bg-popover` class). */
export function popoverMenuShellStyle(compact: boolean): React.CSSProperties | undefined {
    if (!compact) return undefined;
    return {
        background: [
            "linear-gradient(",
            "to bottom,",
            "color-mix(in oklab, hsl(var(--primary)) 8%, hsl(var(--popover))),",
            "color-mix(in oklab, rgb(168 85 247) 8%, hsl(var(--popover)))",
            ")",
        ].join(" "),
    };
}

interface PillPopoverProps {
    value: string;
    onChange: (value: string) => void;
    options: PillPopoverOption[];

    /** Pill trigger content (what shows inside the button). */
    trigger: React.ReactNode;
    /** Override/extend the trigger button className (the pill chrome). */
    triggerClassName?: string;
    disabled?: boolean;
    ariaLabel?: string;

    /** Show the search input. Defaults to true when there are > 8 options. */
    showSearch?: boolean;
    searchPlaceholder?: string;
    /** Compact (landing) styling. Defaults to true. */
    compact?: boolean;
    /** Make the popover modal. Required when rendered inside a Dialog: the
     * Dialog's scroll-lock otherwise blocks wheel/touch scrolling on the
     * body-portaled popover content, so the menu list can't scroll. */
    modal?: boolean;
    /** Content rendered below the options, separated by a border. */
    footer?: React.ReactNode;
    align?: "start" | "center" | "end";
    /** Popover width in px. Defaults to 240 (compact) / 320 (standard). */
    widthPx?: number;
}

export function PillPopover({
    value,
    onChange,
    options,
    trigger,
    triggerClassName,
    disabled,
    ariaLabel,
    showSearch,
    searchPlaceholder = "Search…",
    compact = true,
    modal = false,
    footer,
    align = "start",
    widthPx,
}: PillPopoverProps) {
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");

    const searchEnabled = showSearch ?? options.length > 8;
    const width = widthPx ?? (compact ? 240 : 320);

    const filtered = React.useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return options;
        return options.filter((o) =>
            `${o.label} ${o.description ?? ""} ${o.keywords ?? ""}`.toLowerCase().includes(q),
        );
    }, [options, query]);

    // Group preserving first-seen order; ungrouped options share an empty key.
    const groups = React.useMemo(() => {
        const map = new Map<string, PillPopoverOption[]>();
        for (const o of filtered) {
            const key = o.group ?? "";
            const arr = map.get(key);
            if (arr) arr.push(o);
            else map.set(key, [o]);
        }
        return Array.from(map.entries());
    }, [filtered]);

    // Active-row tracking by value (survives filtering reorders). Row DOM
    // nodes are kept in a ref Map keyed by value; the ref callback deletes
    // its entry on unmount so the map never retains stale/detached nodes.
    const [activeValue, setActiveValue] = React.useState<string | null>(null);
    const rowRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map());
    const listRef = React.useRef<HTMLDivElement>(null);

    const enabledValues = React.useMemo(
        () => filtered.filter((o) => !o.disabled).map((o) => o.value),
        [filtered],
    );

    // Reset the highlight to the selected value (or the first enabled option)
    // whenever the popover opens, the query changes, or the option set itself
    // changes — so `activeValue` always points at a row that exists.
    React.useEffect(() => {
        if (!open) return;
        const target = enabledValues.includes(value) ? value : (enabledValues[0] ?? null);
        setActiveValue(target);
    }, [open, value, enabledValues]);

    React.useEffect(() => {
        if (activeValue) rowRefs.current.get(activeValue)?.scrollIntoView({ block: "nearest" });
    }, [activeValue]);

    const move = (delta: number) => {
        if (enabledValues.length === 0) return;
        const idx = activeValue ? enabledValues.indexOf(activeValue) : -1;
        const base = idx === -1 ? 0 : idx;
        const next = (base + delta + enabledValues.length) % enabledValues.length;
        setActiveValue(enabledValues[next]);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            move(1);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            move(-1);
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (activeValue) {
                onChange(activeValue);
                setOpen(false);
            }
        }
    };

    const select = (v: string) => {
        onChange(v);
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={setOpen} modal={modal}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    disabled={disabled}
                    aria-label={ariaLabel}
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    className={triggerClassName}
                >
                    {trigger}
                    <ChevronDown className="size-3 opacity-50 shrink-0" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                align={align}
                sideOffset={6}
                className="p-0 border-0 bg-transparent shadow-none w-auto"
                // When there's no search input, focus the list itself so the
                // hand-rolled arrow/Enter keyboard handler actually receives
                // events. With search, let the autofocused input take focus
                // (arrow keydowns bubble up to the list's onKeyDown).
                onOpenAutoFocus={(e) => {
                    if (searchEnabled) return;
                    e.preventDefault();
                    listRef.current?.focus();
                }}
            >
                <div
                    onKeyDown={onKeyDown}
                    style={{ width, ...popoverMenuShellStyle(compact) }}
                    className={popoverMenuShellClass(compact)}
                >
                    {searchEnabled && (
                        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-primary/10">
                            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <input
                                autoFocus
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={searchPlaceholder}
                                aria-label="Search options"
                                className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground min-w-0"
                            />
                        </div>
                    )}

                    <div
                        ref={listRef}
                        role="listbox"
                        tabIndex={-1}
                        aria-label={ariaLabel}
                        className="max-h-[260px] overflow-y-auto py-1 outline-none"
                    >
                        {filtered.length === 0 ? (
                            <div className="text-center py-6 text-muted-foreground text-xs px-3">
                                No matches
                            </div>
                        ) : (
                            groups.map(([groupName, rows], gi) => (
                                <div key={groupName || `__ungrouped_${gi}`}>
                                    {groupName && (
                                        <div className="px-3 pt-1.5 pb-0.5 text-xs font-medium text-muted-foreground">
                                            {groupName}
                                        </div>
                                    )}
                                    {rows.map((o) => (
                                        <Row
                                            key={o.value}
                                            option={o}
                                            selected={o.value === value}
                                            active={o.value === activeValue}
                                            compact={compact}
                                            onSelect={() => !o.disabled && select(o.value)}
                                            onHover={() => !o.disabled && setActiveValue(o.value)}
                                            ref={(el) => {
                                                if (el) rowRefs.current.set(o.value, el);
                                                else rowRefs.current.delete(o.value);
                                            }}
                                        />
                                    ))}
                                </div>
                            ))
                        )}
                    </div>

                    {footer && (
                        <div className={cn("border-t", compact && "border-primary/10")}>
                            {footer}
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}

interface RowProps {
    option: PillPopoverOption;
    selected: boolean;
    active: boolean;
    compact: boolean;
    onSelect: () => void;
    onHover: () => void;
}

const Row = React.forwardRef<HTMLButtonElement, RowProps>(function Row(
    { option, selected, active, compact, onSelect, onHover },
    ref,
) {
    const primary = option.tone === "primary";
    return (
        <button
            ref={ref}
            type="button"
            role="option"
            aria-selected={selected}
            // Focus stays on the listbox container; rows aren't tab stops.
            tabIndex={-1}
            disabled={option.disabled}
            onClick={onSelect}
            onMouseEnter={onHover}
            className={cn(
                "w-full flex items-center gap-2 text-left cursor-pointer outline-none",
                compact ? "py-1" : "py-1.5",
                selected
                    ? cn(
                          "bg-primary/[0.06] border-l-2 border-primary",
                          compact ? "pl-[6px] pr-2" : "pl-[10px] pr-3",
                      )
                    : cn(
                          "border-l-2 border-transparent",
                          compact ? "px-2" : "px-3",
                          active && "bg-accent",
                      ),
                option.disabled && "opacity-50 cursor-not-allowed",
            )}
        >
            {option.dotColor && (
                <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: option.dotColor }}
                />
            )}
            {option.icon && (
                <span
                    className={cn(
                        "shrink-0 inline-flex items-center [&_svg]:w-3.5 [&_svg]:h-3.5",
                        primary ? "text-primary" : "text-muted-foreground",
                    )}
                >
                    {option.icon}
                </span>
            )}
            <span className="flex items-baseline gap-2 min-w-0 flex-1">
                <span className={cn("truncate text-xs font-normal", primary && "text-primary")}>
                    {option.label}
                </span>
                {option.description && (
                    <span className="text-xs text-muted-foreground truncate">
                        {option.description}
                    </span>
                )}
            </span>
            {option.trailing}
            {selected && <Check className="w-3 h-3 text-primary shrink-0" />}
        </button>
    );
});
