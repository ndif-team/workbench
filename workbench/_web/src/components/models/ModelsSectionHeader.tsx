"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, ChevronDown, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useIsDark } from "@/hooks/useIsDark";
import {
    MODEL_STATUS,
    FILTERABLE_HEAT,
    GROUP_COLOR,
    type ModelHeat,
    type ModelGroup,
} from "@/components/model-selector/status";
import type { ModelCardModel } from "./ModelCard";

const GROUPS: ReadonlyArray<ModelGroup> = ["base", "chat"];

export interface GroupPreview {
    total: number;
    preview: ModelCardModel[];
}

interface ModelsSectionHeaderProps {
    collapsed: boolean;
    onToggle: () => void;
    total: number;
    filteredTotal: number;
    groupPreviews: { base: GroupPreview; chat: GroupPreview };
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
    collapsed,
    onToggle,
    total,
    filteredTotal,
    groupPreviews,
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

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (collapsed) return;
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
    }, [collapsed, onQuery]);

    return (
        <div className={cn("flex flex-col", collapsed ? "gap-6" : "gap-4")}>
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-baseline gap-3 mr-auto">
                    <h2 className="text-lg">Models</h2>
                    {!hasError && !isLoading && (
                        <span className="text-sm text-muted-foreground tabular-nums">
                            {filtered ? `${filteredTotal} of ${total}` : total}
                        </span>
                    )}
                </div>

                {collapsed && isLoading && (
                    <span
                        role="status"
                        aria-label="Loading models"
                        className={cn(
                            "inline-flex items-center gap-1.5 shrink-0",
                            "h-6 px-2 rounded-sm",
                            "text-xs font-semibold uppercase tracking-wide",
                            "text-primary",
                            "bg-primary/[0.10] dark:bg-primary/[0.18]",
                            "ring-1 ring-inset ring-primary/30",
                        )}
                    >
                        <Loader2 className="w-3 h-3 animate-spin" />
                        loading
                    </span>
                )}

                {collapsed && hasError && (
                    <span
                        role="status"
                        aria-label="Models unavailable"
                        className={cn(
                            "inline-flex items-center gap-1.5 shrink-0",
                            "h-6 px-2 rounded-sm",
                            "text-xs font-semibold uppercase tracking-wide",
                            "text-red-700 dark:text-red-400",
                            "bg-red-500/[0.12] dark:bg-red-500/[0.18]",
                            "ring-1 ring-inset ring-red-500/30",
                        )}
                    >
                        <AlertTriangle className="w-3 h-3" />
                        unavailable
                    </span>
                )}

                {!collapsed && (
                    <div className="flex flex-wrap items-center gap-3">
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

                        <div className="flex items-center gap-1.5">
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

                        <div className="flex items-center gap-1.5">
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
                    </div>
                )}

                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggle();
                    }}
                    aria-expanded={!collapsed}
                    aria-label={collapsed ? "Expand models" : "Collapse models"}
                >
                    <ChevronDown
                        className={cn(
                            "h-4 w-4 transition-transform duration-200",
                            !collapsed && "rotate-180",
                        )}
                    />
                </Button>
            </div>

            {collapsed && total > 0 && <CollapsedGroupTiles groupPreviews={groupPreviews} />}
        </div>
    );
}

function CollapsedGroupTiles({
    groupPreviews,
}: {
    groupPreviews: { base: GroupPreview; chat: GroupPreview };
}) {
    const visibleGroups = GROUPS.filter((g) => groupPreviews[g].total > 0);
    const isDark = useIsDark();
    if (visibleGroups.length === 0) return null;

    return (
        <div
            className={cn(
                "grid gap-3",
                visibleGroups.length === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1",
            )}
        >
            {visibleGroups.map((g) => {
                const { total, preview } = groupPreviews[g];
                const groupColor = GROUP_COLOR[g];
                const remaining = total - preview.length;
                const pillStyle = isDark
                    ? {
                          color: `color-mix(in oklab, ${groupColor} 75%, white)`,
                          background: `color-mix(in oklab, ${groupColor} 22%, transparent)`,
                      }
                    : {
                          color: groupColor,
                          background: `color-mix(in oklab, ${groupColor} 14%, transparent)`,
                      };
                return (
                    <div
                        key={g}
                        className="flex flex-col gap-2.5 p-3 rounded-lg border bg-card/40"
                        style={{
                            borderColor: `color-mix(in oklab, ${groupColor} 30%, transparent)`,
                        }}
                    >
                        <div className="flex items-center gap-2.5">
                            <span
                                className="inline-flex items-center h-7 px-3 rounded-md text-sm font-medium"
                                style={pillStyle}
                            >
                                {g}
                            </span>
                            <span className="text-sm text-muted-foreground tabular-nums">
                                {total} model{total === 1 ? "" : "s"}
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                            {preview.map((m) => (
                                <span
                                    key={`${m.org}/${m.name}`}
                                    title={`${m.org}/${m.name} — ${m.heat}`}
                                    className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md border bg-card/70 font-mono text-xs"
                                >
                                    <span
                                        className="w-1.5 h-1.5 rounded-full shrink-0"
                                        style={{
                                            background: MODEL_STATUS[m.heat].color,
                                        }}
                                    />
                                    <span className="truncate max-w-[180px]">{m.name}</span>
                                </span>
                            ))}
                            {remaining > 0 && (
                                <span className="inline-flex items-center h-6 px-1 text-xs text-muted-foreground">
                                    +{remaining} more →
                                </span>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
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
