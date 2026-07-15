"use client";

import { useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { useCapture } from "@/lib/analytics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getModels } from "@/lib/api/modelsApi";
import { getChartById, setChartData } from "@/lib/queries/chartQueries";
import { useLensRunHeatmaps } from "@/lib/api/lensRunApi";
import { queryKeys } from "@/lib/queryKeys";
import { useWorkspace } from "@/stores/useWorkspace";
import { CausalMediationExplorer } from "edulogitlens";
import type { LogitLensData, Intervention, CausalMediationEvent } from "edulogitlens";
import { PatchLensResult, usePatchLensIntervention } from "@/lib/api/patchLensApi";
import { transformToEduFormat } from "@/lib/edu-lens";
import type { PatchLensChartData } from "@/types/patchLens";

function CMSkeleton({ message, showTarget }: { message: string; showTarget: boolean }) {
    const SkeletonGrid = () => (
        <div className="rounded-md border bg-secondary/30 p-4 animate-pulse">
            <div className="h-3 w-32 mb-3 rounded bg-muted-foreground/20" />
            <div
                className="grid gap-1"
                style={{
                    gridTemplateColumns: "repeat(8, minmax(0, 1fr))",
                    gridTemplateRows: "repeat(5, minmax(0, 1fr))",
                }}
            >
                {Array.from({ length: 40 }).map((_, i) => (
                    <div key={i} className="h-6 w-full rounded-sm bg-muted-foreground/15" />
                ))}
            </div>
        </div>
    );

    return (
        <div className="flex flex-col gap-4" aria-live="polite">
            <div className="rounded-md border border-dashed border-border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground text-center">
                {message}
            </div>
            <div
                className="grid gap-4"
                style={{
                    gridTemplateColumns: showTarget
                        ? "minmax(0, 1fr) minmax(0, 1fr)"
                        : "minmax(0, 1fr)",
                }}
            >
                <SkeletonGrid />
                {showTarget && <SkeletonGrid />}
            </div>
        </div>
    );
}

interface PatchLensDisplayProps {
    sourcePrompt: string;
    targetPrompt: string;
    lensResult?: PatchLensResult | null;
}

export function PatchLensDisplay({
    sourcePrompt,
    targetPrompt,
    lensResult,
}: PatchLensDisplayProps) {
    const { chartId } = useParams<{ chartId: string }>();
    const capture = useCapture();
    const { selectedModelIdx } = useWorkspace();
    const queryClient = useQueryClient();

    const { data: models } = useQuery({
        queryKey: ["models"],
        queryFn: getModels,
        refetchInterval: 120000,
    });

    const selectedModel = useMemo(() => {
        if (!models || models.length === 0) return undefined;
        return models[selectedModelIdx]?.name || models[0].name;
    }, [models, selectedModelIdx]);

    // The patch-lens chart row no longer carries heatmaps — only prompts, the
    // prompts the active run was computed from, and a pointer (activeLensRunId)
    // to the lens_runs row that owns the heatmaps.
    const { data: chart } = useQuery({
        queryKey: queryKeys.charts.chart(chartId as string),
        queryFn: () => getChartById(chartId as string),
        enabled: !!chartId,
    });

    const persistedData = useMemo<PatchLensChartData | null>(() => {
        const raw = chart?.data as unknown;
        if (!raw || typeof raw !== "object") return null;
        return raw as PatchLensChartData;
    }, [chart]);

    // Fetch the active run's heatmaps on demand (the run mutation seeds this
    // cache, so a just-run / just-restored entry is a hit). `fetched` carries
    // source/target and any patched (interventionResult) heatmap.
    const activeId = persistedData?.activeLensRunId;
    const { data: heatmapRows, isLoading: heatmapsLoading } = useLensRunHeatmaps(
        activeId ? [activeId] : [],
    );
    const fetched = heatmapRows?.[0]?.data;

    const trimmedTarget = targetPrompt.trim();
    const targetExpected = trimmedTarget.length > 0;

    // "Live" heatmaps: the ephemeral lensResult (a fresh run this session) wins
    // over the fetched run heatmaps (a revisit / restore).
    const liveSource = lensResult?.source ?? fetched?.source;
    const liveTarget = lensResult?.target ?? fetched?.target;

    // Provenance for staleness is ALWAYS read from the chart row: the run
    // mutation writes lastRunSourcePrompt = the run's prompt, while the
    // debounced autosave updates sourcePrompt but NOT lastRunSourcePrompt. So
    // after an edit, liveSrcRun !== sourcePrompt → stale → placeholder. (Reading
    // it off the ephemeral lensResult would miss edits made after a run.)
    const liveSrcRun = persistedData?.lastRunSourcePrompt ?? null;
    const liveTgtRun = persistedData?.lastRunTargetPrompt ?? null;

    const hasAnyData = !!liveSource;
    const isStale =
        hasAnyData &&
        ((liveSrcRun !== null && liveSrcRun !== sourcePrompt) ||
            (liveTgtRun !== null && liveTgtRun !== targetPrompt));
    // No source data yet, OR target was expected (two-prompt mode) but is missing.
    const isMissingExpectedData = !liveSource || (targetExpected && !liveTarget);

    const showPlaceholder = isStale || isMissingExpectedData;

    const sourceData = useMemo(
        () => (showPlaceholder || !liveSource ? undefined : transformToEduFormat(liveSource)),
        [showPlaceholder, liveSource],
    );
    const targetData = useMemo(
        () => (showPlaceholder || !liveTarget ? undefined : transformToEduFormat(liveTarget)),
        [showPlaceholder, liveTarget],
    );

    // Undefined (not null) when absent, so CausalMediationExplorer treats the
    // result as uncontrolled and falls back to internal state populated by the
    // handleIntervention promise. When the active run carries a patched pass, we
    // pass it as a controlled override so revisits restore the UI.
    const persistedResultData = useMemo(
        () => transformToEduFormat(fetched?.interventionResult),
        [fetched],
    );

    // Map the persisted patch spec (chart row) into the widget's Intervention
    // shape so a restored / revisited patch redraws the cone + arrow + result
    // grid without a live drag. undefined when the chart carries no patch.
    const interventionForWidget = useMemo<Intervention | undefined>(() => {
        const spec = persistedData?.intervention;
        if (!spec) return undefined;
        return {
            sourcePromptId: "source",
            targetPromptId: "target",
            sourceLayer: spec.srcLayer,
            sourceTokenPosition: spec.srcTokenPos,
            targetLayer: spec.tgtLayer,
            targetTokenPosition: spec.tgtTokenPos,
        };
    }, [persistedData]);

    const { mutateAsync: runIntervention, isPending: isInterventionPending } =
        usePatchLensIntervention();

    const handleIntervention = useCallback(
        async (i: Intervention): Promise<LogitLensData | null> => {
            if (!chartId || !selectedModel) return null;
            capture("patch_lens_intervention_applied", {
                source_layer: i.sourceLayer,
                source_token_position: i.sourceTokenPosition,
                target_layer: i.targetLayer,
                target_token_position: i.targetTokenPosition,
            });
            try {
                const result = await runIntervention({
                    model: selectedModel,
                    srcPrompt: sourcePrompt,
                    tgtPrompt: targetPrompt,
                    chartId,
                    intervention: {
                        srcTokenPos: i.sourceTokenPosition,
                        srcLayer: i.sourceLayer,
                        tgtTokenPos: i.targetTokenPosition,
                        tgtLayer: i.targetLayer,
                    },
                });
                return transformToEduFormat(result) ?? null;
            } catch {
                return null;
            }
        },
        [chartId, selectedModel, sourcePrompt, targetPrompt, runIntervention, capture],
    );

    // Clear the persisted patch when the user resets the intervention, so the
    // controlled `intervention` prop stops re-supplying it. The run keeps its own
    // patch record (history is unaffected) — this only un-patches the view.
    const handleResetIntervention = useCallback(async () => {
        if (!chartId) return;
        const existing = await getChartById(chartId);
        const existingData = (existing?.data ?? {}) as Partial<PatchLensChartData>;
        if (existingData.intervention === undefined) return;
        capture("patch_lens_intervention_reset", {});
        const next = { ...existingData };
        delete next.intervention;
        await setChartData(chartId, next as PatchLensChartData, "patch-lens");
        queryClient.setQueryData(
            queryKeys.charts.chart(chartId),
            (prev: Awaited<ReturnType<typeof getChartById>> | undefined) =>
                prev ? { ...prev, data: next } : prev,
        );
        queryClient.invalidateQueries({ queryKey: queryKeys.charts.chart(chartId) });
    }, [chartId, queryClient, capture]);

    // Map the widget's in-chart interactions to product analytics. Cell
    // expansions become cell_expanded; token/layer step changes become
    // param_changed. Coordinates only — never token text.
    const handleWidgetEvent = useCallback(
        (event: CausalMediationEvent) => {
            if (event.type === "cell_click") {
                capture("cell_expanded", {
                    tool: "patch-lens",
                    grid: event.promptId,
                    token_position: event.tokenPosition,
                    layer: event.layer,
                });
            } else if (event.type === "result_cell_click") {
                capture("cell_expanded", {
                    tool: "patch-lens",
                    grid: "result",
                    token_position: event.tokenPosition,
                    layer: event.layer,
                });
            } else if (event.type === "token_step_change") {
                capture("param_changed", {
                    tool: "patch-lens",
                    param: "token_step",
                    value: event.step,
                });
            } else if (event.type === "layer_step_change") {
                capture("param_changed", {
                    tool: "patch-lens",
                    param: "layer_step",
                    value: event.step,
                });
            }
        },
        [capture],
    );

    // A run is attached but its heatmaps haven't arrived yet (revisit / restore,
    // no ephemeral result). Show the skeleton rather than the "no analysis"
    // placeholder so we don't flash an empty state before the cache resolves.
    if (activeId && !lensResult && heatmapsLoading && !fetched) {
        return (
            <div className="size-full overflow-auto p-6">
                <CMSkeleton message="Loading saved analysis…" showTarget={targetExpected} />
            </div>
        );
    }

    if (showPlaceholder) {
        const message = isStale
            ? "Prompts changed since the last run. Click Run to recompute the lens."
            : "No analysis yet. Enter a prompt and click Run to compute the lens.";
        return (
            <div className="size-full overflow-auto p-6">
                <CMSkeleton message={message} showTarget={targetExpected} />
            </div>
        );
    }

    return (
        <div id="patch-lens-display" className="size-full overflow-auto">
            <CausalMediationExplorer
                sourcePromptText={sourcePrompt}
                targetPromptText={targetPrompt}
                sourceData={sourceData}
                targetData={targetData}
                onIntervention={handleIntervention}
                resultData={persistedResultData}
                intervention={interventionForWidget}
                onResetIntervention={handleResetIntervention}
                isInterventionPending={isInterventionPending}
                onEvent={handleWidgetEvent}
            />
        </div>
    );
}
