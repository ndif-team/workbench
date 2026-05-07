"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import ChartCardsSidebar from "../../components/ChartCardsSidebar";
import CMIntroArea from "./components/CMIntroArea";
import { CMIntroDisplay } from "./components/CMIntroDisplay";
import { useIsMobile } from "@/hooks/useIsMobile";
import { MobileSidebarDrawer } from "../../components/MobileSidebarDrawer";
import { MobileCollapsibleControls } from "../../components/MobileCollapsibleControls";
import { GitBranch } from "lucide-react";
import { CMIntroLensResult } from "@/lib/api/cmIntroApi";
import { getChartById, setChartData } from "@/lib/queries/chartQueries";
import { queryKeys } from "@/lib/queryKeys";
import type { CMIntroChartData } from "@/types/cmIntro";

const PROMPT_AUTOSAVE_DEBOUNCE_MS = 600;

const DEFAULT_SOURCE_PROMPT = "The capital of France is";
const DEFAULT_TARGET_PROMPT = "The capital of Germany is";

export default function CMIntroChartPage() {
    const isMobile = useIsMobile();
    const { chartId } = useParams<{ chartId: string }>();
    const queryClient = useQueryClient();
    const [sourcePrompt, setSourcePrompt] = useState(DEFAULT_SOURCE_PROMPT);
    const [targetPrompt, setTargetPrompt] = useState(DEFAULT_TARGET_PROMPT);
    const [lensResult, setLensResult] = useState<CMIntroLensResult | null>(null);
    // Snapshot of the prompts the current lensResult was computed for. Used by
    // CMIntroArea to gate the predicted-next-token hint so it disappears once
    // the user starts editing.
    const [lastRunSrcPrompt, setLastRunSrcPrompt] = useState<string | null>(null);
    const [lastRunTgtPrompt, setLastRunTgtPrompt] = useState<string | null>(null);

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
        if (data?.source && data?.target) {
            setLensResult({ source: data.source, target: data.target });
        }
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

    // Autosave the prompts into the chart row so they survive navigation even
    // if the user never runs the lens. Debounced to avoid a write per keystroke.
    useEffect(() => {
        if (!hydratedRef.current || !chartId) return;
        const handle = setTimeout(async () => {
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
                    <ResizablePanel className="h-full min-w-0" defaultSize={25} minSize={20}>
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
                    </ResizablePanel>
                    <ResizableHandle className="w-[0.8px]" />
                    <ResizablePanel className="min-w-0" defaultSize={75} minSize={40}>
                        <CMIntroDisplay
                            sourcePrompt={sourcePrompt}
                            targetPrompt={targetPrompt}
                            lensResult={lensResult}
                        />
                    </ResizablePanel>
                </ResizablePanelGroup>
            </div>
        </div>
    );
}
