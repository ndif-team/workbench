"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import type { ImperativePanelHandle } from "react-resizable-panels";
import ChartCardsSidebar from "../../components/ChartCardsSidebar";
import CMIntroArea from "./components/CMIntroArea";
import { CMIntroDisplay } from "./components/CMIntroDisplay";
import { LensHistoryRail, CollapsedHistoryBar } from "./components/LensHistoryRail";
import { useIsMobile } from "@/hooks/useIsMobile";
import { MobileSidebarDrawer } from "../../components/MobileSidebarDrawer";
import { MobileCollapsibleControls } from "../../components/MobileCollapsibleControls";
import { GitBranch } from "lucide-react";
import { CMIntroLensResult } from "@/lib/api/cmIntroApi";
import { getModels } from "@/lib/api/modelsApi";
import { useWorkspace } from "@/stores/useWorkspace";
import { getChartById, setChartData } from "@/lib/queries/chartQueries";
import { getLensRunHeatmapsByIds } from "@/lib/queries/lensRunQueries";
import { queryKeys } from "@/lib/queryKeys";
import type { CMIntroChartData } from "@/types/cmIntro";
import type { NormalizedRun } from "@/lib/lensRun";

const PROMPT_AUTOSAVE_DEBOUNCE_MS = 600;

export default function CMIntroChartPage() {
    const isMobile = useIsMobile();
    const { chartId } = useParams<{ chartId: string }>();
    const queryClient = useQueryClient();
    const { setSelectedModelIdx } = useWorkspace();
    // Model list (shares the React Query cache with CMIntroArea/Display) so a
    // history restore can re-select the model the entry was computed with.
    const { data: models } = useQuery({ queryKey: ["models"], queryFn: getModels });
    const [sourcePrompt, setSourcePrompt] = useState("");
    const [targetPrompt, setTargetPrompt] = useState("");
    const [lensResult, setLensResult] = useState<CMIntroLensResult | null>(null);
    // Snapshot of the prompts the current lensResult was computed for. Used by
    // CMIntroArea to gate the predicted-next-token hint so it disappears once
    // the user starts editing.
    const [lastRunSrcPrompt, setLastRunSrcPrompt] = useState<string | null>(null);
    const [lastRunTgtPrompt, setLastRunTgtPrompt] = useState<string | null>(null);
    // Bumped on each history restore so CMIntroArea re-tokenizes the swapped-in
    // prompts and shows the chip view.
    const [restoreNonce, setRestoreNonce] = useState(0);

    // Prompt-history rail collapses to a slim strip by default so the chart gets
    // the room; the user expands it on demand. State drives which UI renders;
    // the imperative panel handle drives the actual layout width.
    const historyPanelRef = useRef<ImperativePanelHandle>(null);
    const [historyCollapsed, setHistoryCollapsed] = useState(true);
    const HISTORY_COLLAPSED_SIZE = 4;
    const HISTORY_EXPANDED_SIZE = 24;
    const expandHistory = useCallback(() => {
        setHistoryCollapsed(false);
        historyPanelRef.current?.resize(HISTORY_EXPANDED_SIZE);
    }, []);
    const collapseHistory = useCallback(() => {
        setHistoryCollapsed(true);
        historyPanelRef.current?.resize(HISTORY_COLLAPSED_SIZE);
    }, []);

    const { data: chart } = useQuery({
        queryKey: queryKeys.charts.chart(chartId as string),
        queryFn: () => getChartById(chartId as string),
        enabled: !!chartId,
    });

    // hydratedRef gates autosave: we must absorb any persisted prompts before
    // the autosave effect is allowed to write, otherwise the first render
    // would clobber a stored prompt with the default placeholder.
    const hydratedRef = useRef(false);
    useEffect(() => {
        if (hydratedRef.current) return;
        if (chart === undefined) return;
        const data = chart?.data as Partial<CMIntroChartData> | undefined;
        if (typeof data?.sourcePrompt === "string") setSourcePrompt(data.sourcePrompt);
        if (typeof data?.targetPrompt === "string") setTargetPrompt(data.targetPrompt);
        // No heatmaps on the chart row anymore — lensResult stays null on load;
        // CMIntroDisplay fetches the active run's heatmaps by activeLensRunId.
        if (typeof data?.lastRunSourcePrompt === "string") {
            setLastRunSrcPrompt(data.lastRunSourcePrompt);
        }
        if (typeof data?.lastRunTargetPrompt === "string") {
            setLastRunTgtPrompt(data.lastRunTargetPrompt);
        }
        hydratedRef.current = true;
    }, [chart]);

    const handleLensResult = useCallback(
        (result: CMIntroLensResult, runSrc: string, runTgt: string) => {
            setLensResult(result);
            setLastRunSrcPrompt(runSrc);
            setLastRunTgtPrompt(runTgt);
        },
        [],
    );

    // Restore a whole history entry onto cm-intro: its source + target prompts
    // and any patch. NormalizedRun carries no heatmaps — we point the chart row
    // at the run (activeLensRunId) and let CMIntroDisplay fetch its heatmaps by
    // id. lensResult is cleared so the fetched-by-id heatmaps drive the display.
    const handleSelectRun = useCallback(
        async (run: NormalizedRun) => {
            const src = run.source.prompt;
            const tgt = run.target?.prompt ?? "";
            // Re-select the model this entry was computed with, so the restored
            // heatmaps, the predicted-next-token, and re-tokenization all line up
            // with the historical run rather than the currently-selected model.
            const modelIdx = models?.findIndex((m) => m.name === run.model) ?? -1;
            if (modelIdx >= 0) setSelectedModelIdx(modelIdx);
            setSourcePrompt(src);
            setTargetPrompt(tgt);
            setLastRunSrcPrompt(src);
            setLastRunTgtPrompt(tgt);
            setRestoreNonce((n) => n + 1);
            setLensResult(null);

            if (!chartId) return;
            const existing = await getChartById(chartId);
            const existingData = (existing?.data ?? {}) as Partial<CMIntroChartData>;
            const merged: CMIntroChartData = {
                ...existingData,
                sourcePrompt: src,
                targetPrompt: tgt,
                lastRunSourcePrompt: src,
                lastRunTargetPrompt: tgt,
                intervention: run.intervention,
                activeLensRunId: run.id,
            };
            await setChartData(chartId, merged, "cm-intro");
            // Warm the run's heatmaps before the chart-row invalidation so the
            // display has them the moment it re-reads activeLensRunId — an
            // instant restore instead of a fetch flash.
            await queryClient.prefetchQuery({
                queryKey: queryKeys.lensRuns.heatmaps([run.id]),
                queryFn: () => getLensRunHeatmapsByIds([run.id]),
            });
            // Update the chart cache synchronously so the display switches to the
            // restored run (activeLensRunId + provenance) immediately. Restore is a
            // plain click handler with no pending-state mask, so relying on the
            // invalidation refetch alone briefly shows the previously-active run.
            queryClient.setQueryData(
                queryKeys.charts.chart(chartId),
                (prev: Awaited<ReturnType<typeof getChartById>> | undefined) =>
                    prev ? { ...prev, data: merged } : prev,
            );
            queryClient.invalidateQueries({ queryKey: queryKeys.charts.chart(chartId) });
        },
        [chartId, queryClient, models, setSelectedModelIdx],
    );

    // Autosave the prompts into the chart row so they survive navigation even
    // if the user never runs the lens. Debounced to avoid a write per keystroke.
    useEffect(() => {
        if (!hydratedRef.current || !chartId) return;
        const handle = setTimeout(async () => {
            // Re-read inside the timeout (not from a stale closure) and spread
            // over the latest row, so a concurrent run/restore write of
            // activeLensRunId/intervention is preserved. The residual race
            // window (a run completing between this read and write) is mitigated
            // by this re-read; a fully field-scoped prompt-update action is a
            // flagged follow-up.
            const existing = await getChartById(chartId);
            const existingData = (existing?.data ?? {}) as Partial<CMIntroChartData>;
            if (
                existingData.sourcePrompt === sourcePrompt &&
                existingData.targetPrompt === targetPrompt
            ) {
                return;
            }
            const merged: CMIntroChartData = {
                ...existingData,
                sourcePrompt,
                targetPrompt,
            };
            await setChartData(chartId, merged, "cm-intro");
            queryClient.invalidateQueries({
                queryKey: queryKeys.charts.chart(chartId),
            });
        }, PROMPT_AUTOSAVE_DEBOUNCE_MS);
        return () => clearTimeout(handle);
    }, [sourcePrompt, targetPrompt, chartId, queryClient]);

    if (isMobile === undefined) return null;

    if (isMobile) {
        return (
            <div className="size-full flex flex-col min-h-0 overflow-auto p-2 pb-20 gap-2">
                <MobileCollapsibleControls label="CM Intro" icon={GitBranch} isRunning={false}>
                    <CMIntroArea
                        sourcePrompt={sourcePrompt}
                        targetPrompt={targetPrompt}
                        onSourcePromptChange={setSourcePrompt}
                        onTargetPromptChange={setTargetPrompt}
                        onLensResult={handleLensResult}
                        lensResult={lensResult}
                        lastRunSrcPrompt={lastRunSrcPrompt}
                        lastRunTgtPrompt={lastRunTgtPrompt}
                    />
                </MobileCollapsibleControls>
                <div className="rounded dark:bg-secondary/50 bg-secondary/80 border min-h-[50vh] flex-1">
                    <CMIntroDisplay
                        sourcePrompt={sourcePrompt}
                        targetPrompt={targetPrompt}
                        lensResult={lensResult}
                    />
                </div>
                <MobileSidebarDrawer />
            </div>
        );
    }

    return (
        <div className="size-full flex min-h-0">
            <ChartCardsSidebar />
            <div className="flex-1 min-w-0 min-h-0 pb-3 pr-3">
                <ResizablePanelGroup
                    direction="horizontal"
                    className="flex size-full rounded dark:bg-secondary/50 bg-secondary/80 border"
                >
                    <ResizablePanel className="h-full min-w-0" defaultSize={23} minSize={18}>
                        {/* CMIntroArea's predicted-next-token chip is now ephemeral:
                            it shows after a run (lensResult is set) but is NOT
                            re-hydrated on revisit, since heatmaps moved off the
                            chart row onto lens_runs. Acceptable — the Display's
                            heatmap (fetched by activeLensRunId) conveys the
                            prediction on revisit. */}
                        <CMIntroArea
                            sourcePrompt={sourcePrompt}
                            targetPrompt={targetPrompt}
                            onSourcePromptChange={setSourcePrompt}
                            onTargetPromptChange={setTargetPrompt}
                            onLensResult={handleLensResult}
                            lensResult={lensResult}
                            lastRunSrcPrompt={lastRunSrcPrompt}
                            lastRunTgtPrompt={lastRunTgtPrompt}
                            restoreNonce={restoreNonce}
                        />
                    </ResizablePanel>
                    <ResizableHandle className="w-[0.8px]" />
                    <ResizablePanel className="min-w-0" defaultSize={73} minSize={35}>
                        <CMIntroDisplay
                            sourcePrompt={sourcePrompt}
                            targetPrompt={targetPrompt}
                            lensResult={lensResult}
                        />
                    </ResizablePanel>
                    <ResizableHandle className="w-[0.8px]" />
                    <ResizablePanel
                        ref={historyPanelRef}
                        className="min-w-0"
                        defaultSize={HISTORY_COLLAPSED_SIZE}
                        minSize={HISTORY_COLLAPSED_SIZE}
                        maxSize={40}
                        onResize={(size) => setHistoryCollapsed(size < HISTORY_COLLAPSED_SIZE + 2)}
                    >
                        {historyCollapsed ? (
                            <CollapsedHistoryBar onExpand={expandHistory} />
                        ) : (
                            <LensHistoryRail
                                onSelectRun={handleSelectRun}
                                onCollapse={collapseHistory}
                            />
                        )}
                    </ResizablePanel>
                </ResizablePanelGroup>
            </div>
        </div>
    );
}
