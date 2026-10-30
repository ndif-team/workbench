"use client";

import { useEffect, useRef, type RefObject } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useIsDark } from "@/hooks/useIsDark";
import {
    MODEL_STATUS,
    FILTERABLE_HEAT,
    GROUP_COLOR,
    type ModelHeat,
    type ModelGroup,
} from "@/components/model-selector/status";

const GROUPS: ReadonlyArray<ModelGroup> = ["base", "chat"];

interface ModelsSectionHeaderProps {
    total: number;
    filteredTotal: number;
    hasError: boolean;
    isLoading: boolean;

    query: string;
    onQuery: (q: string) => void;

    statusFilters: Set<ModelHeat>;
    onToggleStatus: (k: ModelHeat) => void;

    groupFilters: Set<ModelGroup>;
    onToggleGroup: (g: ModelGroup) => void;
}

export function ModelsSectionHeader({
    total,
    filteredTotal,
    hasError,
    isLoading,
    query,
    onQuery,
    statusFilters,
    onToggleStatus,
    groupFilters,
    onToggleGroup,
}: ModelsSectionHeaderProps) {
    const searchRef = useRef<HTMLInputElement>(null);
    const filtered = filteredTotal !== total;
    const activeFilterCount = groupFilters.size + statusFilters.size + (query.trim() ? 1 : 0);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const inField =
                target?.tagName === "INPUT" ||
                target?.tagName === "TEXTAREA" ||
                target?.isContentEditable;
            if (e.key === "/" && !inField) {
                e.preventDefault();
                searchRef.current?.focus();
            } else if (e.key === "Escape" && target === searchRef.current) {
                onQuery("");
                searchRef.current?.blur();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onQuery]);

    return (
        <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-baseline gap-3 mr-auto">
                {!hasError && !isLoading && (
                    <span className="text-sm text-muted-foreground tabular-nums">
                        {filtered ? `${filteredTotal} of ${total} models` : `${total} models`}
                    </span>
                )}
                <a
                    href="https://ndif.us"
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Models are served through NDIF — visit ndif.us"
                    className="group inline-flex items-center gap-1.5 self-center text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                    <span>served by</span>
                    <img
                        src="/images/NDIF.png"
                        alt="NDIF"
                        className="h-6 w-auto opacity-80 transition-opacity group-hover:opacity-100"
                    />
                </a>
            </div>

            {/* Desktop: filters inline. */}
            <div className="hidden gap-3 md:flex md:flex-wrap md:items-center">
                <FilterControls
                    searchRef={searchRef}
                    query={query}
                    onQuery={onQuery}
                    groupFilters={groupFilters}
                    onToggleGroup={onToggleGroup}
                    statusFilters={statusFilters}
                    onToggleStatus={onToggleStatus}
                />
            </div>

            {/* Mobile: collapse filters behind a button + popover so they don't
                consume rows of vertical space. */}
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className={cn(
                            "relative h-7 w-7 md:hidden",
                            activeFilterCount > 0 && "border-primary/40 text-primary",
                        )}
                        aria-label={
                            activeFilterCount > 0
                                ? `Filters (${activeFilterCount} active)`
                                : "Filters"
                        }
                    >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        {activeFilterCount > 0 && (
                            <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground tabular-nums">
                                {activeFilterCount}
                            </span>
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    align="end"
                    className="flex w-auto max-w-[calc(100vw-2rem)] flex-col gap-3 p-3"
                >
                    <FilterControls
                        query={query}
                        onQuery={onQuery}
                        groupFilters={groupFilters}
                        onToggleGroup={onToggleGroup}
                        statusFilters={statusFilters}
                        onToggleStatus={onToggleStatus}
                    />
                </PopoverContent>
            </Popover>
        </div>
    );
}

/**
 * The filter controls (search + type + status). Rendered inline in the header
 * on desktop, and stacked inside a popover on mobile. Pass `searchRef` only to
 * the instance that should own the "/" focus shortcut (the desktop one) to
 * avoid a ref collision between the two instances.
 */
function FilterControls({
    searchRef,
    query,
    onQuery,
    groupFilters,
    onToggleGroup,
    statusFilters,
    onToggleStatus,
}: {
    searchRef?: RefObject<HTMLInputElement>;
    query: string;
    onQuery: (q: string) => void;
    groupFilters: Set<ModelGroup>;
    onToggleGroup: (g: ModelGroup) => void;
    statusFilters: Set<ModelHeat>;
    onToggleStatus: (k: ModelHeat) => void;
}) {
    return (
        <>
            <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => onQuery(e.target.value)}
                    placeholder="search models…"
                    aria-label="Search models"
                    className="h-7 w-44 pl-7 pr-7 text-xs"
                />
                {query && (
                    <button
                        type="button"
                        onClick={() => onQuery("")}
                        aria-label="Clear search"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                        <X className="h-3 w-3" />
                    </button>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">type</span>
                <SegmentedGroup label="Filter by model type">
                    {GROUPS.map((g) => (
                        <FilterChip
                            key={g}
                            label={g}
                            color={GROUP_COLOR[g]}
                            active={groupFilters.has(g)}
                            onClick={() => onToggleGroup(g)}
                        />
                    ))}
                </SegmentedGroup>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">status</span>
                <SegmentedGroup label="Filter by status">
                    {FILTERABLE_HEAT.map((k) => (
                        <FilterChip
                            key={k}
                            label={k}
                            color={MODEL_STATUS[k].color}
                            active={statusFilters.has(k)}
                            onClick={() => onToggleStatus(k)}
                        />
                    ))}
                </SegmentedGroup>
            </div>
        </>
    );
}

function SegmentedGroup({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div
            role="group"
            aria-label={label}
            className="inline-flex items-center gap-0.5 p-0.5 rounded-md border bg-muted/40"
        >
            {children}
        </div>
    );
}

/**
 * A chip in a segmented filter group. Active state uses the canonical heat /
 * group treatment from `ModelControl`'s `HeatBadge`: `color-mix(in oklab, color
 * 14%, transparent)` background with the saturated color as text + dot.
 *
 * Clicking an active chip deselects it; an empty filter set means "show all".
 */
function FilterChip({
    label,
    color,
    active,
    onClick,
}: {
    label: string;
    color: string;
    active: boolean;
    onClick: () => void;
}) {
    const isDark = useIsDark();

    // Dark mode: stronger tint + slightly lifted text color so the saturated
    // mid-tones (especially hot's green) stay clearly readable on the dark
    // segmented-container backdrop. Light mode keeps the established
    // HeatBadge-style 14% tint with the saturated color as text.
    const activeStyle = active
        ? isDark
            ? {
                  color: `color-mix(in oklab, ${color} 75%, white)`,
                  background: `color-mix(in oklab, ${color} 22%, transparent)`,
              }
            : {
                  color,
                  background: `color-mix(in oklab, ${color} 14%, transparent)`,
              }
        : undefined;

    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                "inline-flex items-center gap-1.5 h-6 px-2 rounded-sm text-xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                !active && "text-muted-foreground hover:text-foreground hover:bg-muted/60",
            )}
            style={activeStyle}
        >
            <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                    background: color,
                    opacity: active ? 1 : isDark ? 0.7 : 0.55,
                }}
            />
            {label}
        </button>
    );
}
