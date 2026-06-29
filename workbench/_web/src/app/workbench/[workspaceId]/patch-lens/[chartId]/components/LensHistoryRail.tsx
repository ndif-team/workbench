"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Maximize2 } from "lucide-react";
import { useLensRuns, useClearLensRuns } from "@/lib/api/lensRunApi";
import { getChartById } from "@/lib/queries/chartQueries";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { normalizeLensRun, type NormalizedRun } from "@/lib/lensRun";
import type { PatchLensChartData } from "@/types/patchLens";
import { LensHistoryStrip } from "./LensHistoryStrip";
import { LensCompareOverlay } from "./LensCompareOverlay";

/**
 * F1 container: the prompt-history rail for patch-lens. Fetches the chart's full
 * run history — across ALL models, so it persists when the user switches the
 * active model — and stacks each run (source + optional target + patch) newest
 * first with the most recent highlighted. Clicking a run restores its whole
 * state onto patch-lens; "Compare" opens a full-screen overlay to line up the
 * heatmaps across runs.
 */

interface LensHistoryRailProps {
    onSelectRun: (run: NormalizedRun) => void;
}

export function LensHistoryRail({ onSelectRun }: LensHistoryRailProps) {
    const { chartId, workspaceId } = useParams<{ chartId: string; workspaceId: string }>();

    // No model filter: history is per-chart and survives model switches. Scoped
    // by workspace so the read/clear can't touch another workspace's rows.
    const { data: runs } = useLensRuns(workspaceId, chartId);
    const { mutate: clearHistory, isPending: isClearing } = useClearLensRuns(workspaceId, chartId);
    const [compareOpen, setCompareOpen] = useState(false);

    // The highlight must follow the LOADED run (the one the chart row points at),
    // not always the newest — restoring an older entry should move the ring to
    // it. Read activeLensRunId off the chart row; fall back to the newest run
    // only when the row has no pointer yet.
    const { data: chart } = useQuery({
        queryKey: queryKeys.charts.chart(chartId),
        queryFn: () => getChartById(chartId),
        enabled: !!chartId,
    });
    const chartActiveId = (chart?.data as PatchLensChartData | undefined)?.activeLensRunId;

    // Newest first; normalize rows into the flat NormalizedRun shape.
    const ordered = useMemo<NormalizedRun[]>(
        () => (runs ? [...runs].reverse().map(normalizeLensRun) : []),
        [runs],
    );

    // Which entry the highlight sits on. Tracked locally so a click moves the
    // ring synchronously (no DB round-trip). Initialized to (and synced with)
    // the chart's activeLensRunId; falls back to the newest run when the row has
    // no pointer. handleSelect sets it eagerly, then onSelectRun writes the
    // chart's activeLensRunId + invalidates, so the local + server values
    // reconcile on the next render.
    const newestId = ordered[0]?.id;
    const [activeId, setActiveId] = useState<string | undefined>(chartActiveId ?? newestId);
    useEffect(() => {
        setActiveId(chartActiveId ?? newestId);
    }, [chartActiveId, newestId]);

    const handleSelect = (run: NormalizedRun) => {
        setActiveId(run.id);
        onSelectRun(run);
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium">Prompt history</h2>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground"
                        disabled={!ordered.length}
                        onClick={() => setCompareOpen(true)}
                    >
                        <Maximize2 className="h-3.5 w-3.5 mr-1" />
                        Compare
                    </Button>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-muted-foreground"
                                disabled={!ordered.length || isClearing}
                            >
                                Clear
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-60">
                            <p className="text-sm leading-snug">
                                Clear all prompt history? This can&apos;t be undone.
                            </p>
                            <div className="mt-3 flex justify-end">
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    className="h-7 text-xs"
                                    disabled={isClearing}
                                    onClick={() => clearHistory()}
                                >
                                    Clear history
                                </Button>
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            <div className="space-y-1.5" data-testid="lens-history-list">
                {ordered.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-2 py-6 text-center leading-snug">
                        Run a prompt to start a history. Each run is stacked here so you can compare
                        how successive versions change the final-token prediction.
                    </p>
                ) : (
                    ordered.map((run) => (
                        <LensHistoryStrip
                            key={run.id}
                            run={run}
                            isActive={run.id === activeId}
                            onSelect={handleSelect}
                        />
                    ))
                )}
            </div>

            <LensCompareOverlay runs={ordered} open={compareOpen} onOpenChange={setCompareOpen} />
        </div>
    );
}
