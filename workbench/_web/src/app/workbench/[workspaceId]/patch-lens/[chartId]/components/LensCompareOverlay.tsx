"use client";

import { Fragment, useMemo, useState } from "react";
import { LogitLensGrid } from "edulogitlens";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { transformToEduFormat } from "@/lib/edu-lens";
import { probColor, shortModelName } from "@/lib/lens-format";
import { useLensRunHeatmaps } from "@/lib/api/lensRunApi";
import { promptResultsOf, type NormalizedRun, type PromptResultRef } from "@/lib/lensRun";
import type { LensRunHeatmaps } from "@/types/lensRun";

/**
 * F1 compare overlay: a full-screen view that lines up the prompts the user
 * picks from history. The main area defaults to a COMPACT last-row comparison —
 * each prompt's final-token prediction across layers — grouped into a separate
 * table per model (layer counts differ across models, so they can't share
 * columns). Long layer stacks collapse to the last 5 layers with an expand
 * toggle. Switching to "Full heatmaps" drills into each selected prompt's whole
 * logit-lens grid. Compact strips come from each run's summary; full heatmaps
 * are fetched on demand by run id (batched) when the user switches to that view.
 */

type ViewMode = "compact" | "full";

const TAIL_LAYERS = 5; // always-visible final layers when a table is collapsed

const ROLE_LABEL: Record<PromptResultRef["role"], string> = {
    source: "source",
    target: "target",
    patched: "patched",
};

const refKey = (ref: PromptResultRef) => `${ref.runId}:${ref.role}`;

function groupByModel(refs: PromptResultRef[]): [string, PromptResultRef[]][] {
    const map = new Map<string, PromptResultRef[]>();
    for (const ref of refs) {
        const arr = map.get(ref.model);
        if (arr) arr.push(ref);
        else map.set(ref.model, [ref]);
    }
    return [...map.entries()];
}

function RoleModelLine({ ref }: { ref: PromptResultRef }) {
    return (
        <span className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
            <span className="rounded-sm border px-1 text-xs">{ROLE_LABEL[ref.role]}</span>
            {ref.result.finalToken && (
                <span className="shrink-0 font-mono text-xs text-primary">
                    → {ref.result.finalToken}
                </span>
            )}
        </span>
    );
}

/**
 * Compact comparison for ONE model: one row per prompt, one column per layer,
 * each cell the top-1 token at the final input position (colored by
 * probability). A single grid so columns line up across prompts. Collapses to
 * the last 5 layers by default; the intermediate layers expand on demand. No
 * zoom/step controls — this is the at-a-glance default.
 */
function LastRowTable({ model, refs }: { model: string; refs: PromptResultRef[] }) {
    const maxLayers = refs.reduce((m, r) => Math.max(m, r.result.lastRow.cells.length), 0);
    // How many trailing layers to show. Default to the last 5 (clamped to what
    // the model has); the user can dial this up to the full stack.
    const [tailN, setTailN] = useState(TAIL_LAYERS);

    const layerLabels = useMemo(() => {
        const withMost = refs.find((r) => r.result.lastRow.cells.length === maxLayers);
        return withMost?.result.lastRow.layers ?? Array.from({ length: maxLayers }, (_, i) => i);
    }, [refs, maxLayers]);

    const effectiveTail = Math.min(Math.max(1, tailN), maxLayers);
    const collapsed = effectiveTail < maxLayers;
    // Indices of the layer columns to render. Collapsed → only the last N.
    const visibleIdxs = collapsed
        ? Array.from({ length: effectiveTail }, (_, i) => maxLayers - effectiveTail + i)
        : Array.from({ length: maxLayers }, (_, i) => i);
    const hiddenCount = maxLayers - visibleIdxs.length;

    const LABEL_W = 240;
    const CELL_W = 52;
    const GAP_W = 36;
    const gridTemplateColumns = `${LABEL_W}px${collapsed ? ` ${GAP_W}px` : ""} repeat(${visibleIdxs.length}, ${CELL_W}px)`;

    return (
        <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">
                    {shortModelName(model)}
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        · {maxLayers} layers
                    </span>
                </h3>
                {maxLayers > 1 && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span>Last</span>
                        <input
                            type="number"
                            min={1}
                            max={maxLayers}
                            value={effectiveTail}
                            onChange={(e) =>
                                setTailN(Math.max(1, parseInt(e.target.value, 10) || 1))
                            }
                            aria-label="Number of trailing layers to show"
                            className="h-6 w-14 rounded border bg-background px-1.5 text-center text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                        <span>of {maxLayers}</span>
                        <button
                            type="button"
                            onClick={() => setTailN(maxLayers)}
                            disabled={!collapsed}
                            className="text-primary hover:underline disabled:opacity-40 disabled:no-underline"
                        >
                            All
                        </button>
                    </div>
                )}
            </div>

            <div className="overflow-x-auto rounded border">
                <div className="grid w-max gap-px text-xs" style={{ gridTemplateColumns }}>
                    {/* Header row */}
                    <div className="sticky left-0 z-10 bg-background px-2 py-1 font-medium text-muted-foreground">
                        Prompt
                    </div>
                    {collapsed && (
                        <button
                            type="button"
                            onClick={() => setTailN(maxLayers)}
                            title={`${hiddenCount} earlier layers hidden — click to show all`}
                            className="bg-background py-1 text-center text-muted-foreground hover:text-foreground"
                        >
                            ⋯
                        </button>
                    )}
                    {visibleIdxs.map((li) => (
                        <div
                            key={li}
                            className="bg-background py-1 text-center text-muted-foreground"
                        >
                            {layerLabels[li] ?? li}
                        </div>
                    ))}

                    {/* One row per prompt */}
                    {refs.map((ref) => (
                        <Fragment key={refKey(ref)}>
                            <div className="sticky left-0 z-10 flex flex-col justify-center gap-0.5 bg-background py-1.5 pr-2">
                                <span className="font-mono text-xs leading-snug break-words text-foreground/90">
                                    {ref.result.prompt || "(empty prompt)"}
                                </span>
                                <RoleModelLine ref={ref} />
                            </div>
                            {collapsed && (
                                <div className="flex items-center justify-center text-muted-foreground/40">
                                    ⋯
                                </div>
                            )}
                            {visibleIdxs.map((li) => {
                                const cell = ref.result.lastRow.cells[li];
                                if (!cell) return <div key={li} />;
                                return (
                                    <div
                                        key={li}
                                        title={`Layer ${layerLabels[li] ?? li}: ${cell.token} (${(cell.prob * 100).toFixed(1)}%)`}
                                        className="flex items-center justify-center overflow-hidden px-0.5 py-1"
                                        style={{ backgroundColor: probColor(cell.prob) }}
                                    >
                                        <span
                                            className={cn(
                                                "truncate font-mono",
                                                cell.prob > 0.6
                                                    ? "text-white"
                                                    : "text-foreground/80",
                                            )}
                                        >
                                            {cell.token.trim() || "·"}
                                        </span>
                                    </div>
                                );
                            })}
                        </Fragment>
                    ))}
                </div>
            </div>
        </section>
    );
}

interface LensCompareOverlayProps {
    runs: NormalizedRun[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function LensCompareOverlay({ runs, open, onOpenChange }: LensCompareOverlayProps) {
    // Every prompt result across all runs is independently selectable.
    const refs = useMemo<PromptResultRef[]>(() => runs.flatMap(promptResultsOf), [runs]);

    // Start empty: the user chooses what to compare.
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [viewMode, setViewMode] = useState<ViewMode>("compact");

    const toggle = (key: string) =>
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });

    // Memoized so the downstream `groups` / `selectedRunIds` memos keep a stable
    // input identity (a fresh filter() each render would defeat them).
    const selectedRefs = useMemo(
        () => refs.filter((r) => selected.has(refKey(r))),
        [refs, selected],
    );
    // Both views group selected prompts by model (layer counts differ across
    // models, so they can't share a table / heatmap-grid header).
    const groups = useMemo(() => groupByModel(selectedRefs), [selectedRefs]);

    // Full heatmaps are fetched on demand, batched by the distinct run ids the
    // selection spans — one round-trip regardless of how many prompts/roles are
    // picked. Gated to the "full" view by passing [] otherwise (useLensRunHeatmaps
    // disables on an empty id set).
    const selectedRunIds = useMemo(
        () => [...new Set(selectedRefs.map((r) => r.runId))],
        [selectedRefs],
    );
    const { data: heatmapRows } = useLensRunHeatmaps(viewMode === "full" ? selectedRunIds : []);
    const heatmapsByRun = useMemo(() => {
        const map = new Map<string, LensRunHeatmaps>();
        for (const row of heatmapRows ?? []) map.set(row.id, row.data);
        return map;
    }, [heatmapRows]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                showCloseButton
                className="flex h-[90vh] w-[95vw] max-w-[95vw] flex-col gap-0 p-0 sm:max-w-[95vw]"
            >
                <DialogHeader className="flex flex-row items-center justify-between gap-4 border-b p-4 pr-12 text-left space-y-0">
                    <div className="space-y-1">
                        <DialogTitle className="text-base">Compare prompts</DialogTitle>
                        <DialogDescription>
                            Pick prompts on the left to line up their final-token prediction across
                            layers. Switch to full heatmaps to drill in.
                        </DialogDescription>
                    </div>
                    <div className="flex shrink-0 items-center rounded-md border p-0.5">
                        {(["compact", "full"] as const).map((mode) => (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => setViewMode(mode)}
                                className={cn(
                                    "rounded px-2.5 py-1 text-xs transition-colors",
                                    viewMode === mode
                                        ? "bg-primary text-primary-foreground"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {mode === "compact" ? "Last row" : "Full heatmaps"}
                            </button>
                        ))}
                    </div>
                </DialogHeader>

                <div className="flex min-h-0 flex-1">
                    {/* Selection list */}
                    <div className="w-72 shrink-0 space-y-1.5 overflow-y-auto border-r p-2">
                        {refs.length === 0 ? (
                            <p className="px-2 py-6 text-center text-xs leading-snug text-muted-foreground">
                                No history yet. Run a prompt to populate the comparison.
                            </p>
                        ) : (
                            refs.map((ref) => {
                                const key = refKey(ref);
                                return (
                                    <label
                                        key={key}
                                        className={cn(
                                            "flex cursor-pointer gap-2 rounded border px-2 py-2",
                                            selected.has(key)
                                                ? "border-primary bg-primary/5"
                                                : "border-border bg-background",
                                        )}
                                    >
                                        <Checkbox
                                            className="mt-0.5"
                                            checked={selected.has(key)}
                                            onCheckedChange={() => toggle(key)}
                                        />
                                        <div className="min-w-0 flex-1 space-y-1">
                                            <div className="font-mono text-xs break-words text-foreground/90">
                                                {ref.result.prompt || "(empty prompt)"}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <span className="rounded-sm border px-1 text-xs text-muted-foreground">
                                                    {ROLE_LABEL[ref.role]}
                                                </span>
                                                <span
                                                    className="text-xs text-muted-foreground"
                                                    title={ref.model}
                                                >
                                                    {shortModelName(ref.model)}
                                                </span>
                                                {ref.result.finalToken && (
                                                    <span className="font-mono text-xs text-primary">
                                                        → {ref.result.finalToken}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex gap-px" aria-hidden="true">
                                                {ref.result.lastRow.cells.map((cell, i) => (
                                                    <div
                                                        key={i}
                                                        className="h-2.5 flex-1 min-w-[2px] rounded-[1px]"
                                                        style={{
                                                            backgroundColor: probColor(cell.prob),
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    </label>
                                );
                            })
                        )}
                    </div>

                    {/* Comparison area */}
                    <div className="min-w-0 flex-1 overflow-auto p-4">
                        {selectedRefs.length === 0 ? (
                            <div className="flex h-full items-center justify-center">
                                <p className="max-w-xs text-center text-sm text-muted-foreground">
                                    Select one or more prompts on the left to compare them.
                                </p>
                            </div>
                        ) : viewMode === "compact" ? (
                            <div className="space-y-6">
                                {groups.map(([model, groupRefs]) => (
                                    <LastRowTable key={model} model={model} refs={groupRefs} />
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {groups.map(([model, groupRefs]) => (
                                    <section key={model} className="space-y-2">
                                        <h3 className="text-sm font-medium">
                                            {shortModelName(model)}
                                        </h3>
                                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                            {groupRefs.map((ref) => {
                                                // Pick this ref's heatmap out of its run's fetched
                                                // bundle: the patched pass for the "patched" role,
                                                // otherwise the source/target heatmap by role name.
                                                const bundle = heatmapsByRun.get(ref.runId);
                                                const raw =
                                                    bundle?.[
                                                        ref.role === "patched"
                                                            ? "interventionResult"
                                                            : ref.role
                                                    ];
                                                const grid = transformToEduFormat(raw);
                                                return (
                                                    <div
                                                        key={refKey(ref)}
                                                        className="flex h-[560px] min-w-0 flex-col rounded border"
                                                    >
                                                        <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
                                                            <span className="truncate font-mono text-xs text-foreground/90">
                                                                {ref.result.prompt ||
                                                                    "(empty prompt)"}
                                                            </span>
                                                            <span className="shrink-0 rounded-sm border px-1 text-xs text-muted-foreground">
                                                                {ROLE_LABEL[ref.role]}
                                                            </span>
                                                        </div>
                                                        {/* LogitLensGrid is height:100% with
                                                            overflow:hidden — it needs a definite
                                                            height or it collapses to just its
                                                            controls bar. flex-1 + min-h-0 off the
                                                            fixed-height card gives it one. Render
                                                            only once the heatmap has been fetched;
                                                            otherwise a faint placeholder while the
                                                            batched fetch resolves. */}
                                                        <div className="min-h-0 min-w-0 flex-1 p-2">
                                                            {grid ? (
                                                                <LogitLensGrid data={grid} />
                                                            ) : (
                                                                <div
                                                                    aria-live="polite"
                                                                    className="flex size-full items-center justify-center rounded bg-secondary/30"
                                                                >
                                                                    <span className="text-xs text-muted-foreground">
                                                                        Loading heatmap…
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </section>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
