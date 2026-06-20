"use client";

import { useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getModels } from "@/lib/api/modelsApi";
import { getChartById } from "@/lib/queries/chartQueries";
import { queryKeys } from "@/lib/queryKeys";
import { useWorkspace } from "@/stores/useWorkspace";
import { CausalMediationExplorer } from "edulogitlens";
import type { LogitLensData, LogitCell, Intervention } from "edulogitlens";
import { CMIntroLensResult, useCMIntroIntervention } from "@/lib/api/cmIntroApi";
import type { LogitLensIntroData } from "@/types/logitLensIntro";
import type { CMIntroChartData } from "@/types/cmIntro";

function CMSkeleton({ message, showTarget }: { message: string; showTarget: boolean }) {
    const SkeletonGrid = () => (
        <div className="rounded-lg border bg-secondary/30 p-4 animate-pulse">
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
        <div className="flex flex-col gap-4">
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

interface CMIntroDisplayProps {
    sourcePrompt: string;
    targetPrompt: string;
    lensResult?: CMIntroLensResult | null;
    // Snapshots of the prompts the ephemeral lensResult was actually computed
    // for. Used to detect "user edited the prompts after the last run" so we
    // can show a placeholder instead of a stale heatmap.
    lastRunSrcPrompt?: string | null;
    lastRunTgtPrompt?: string | null;
    // D1: collapse each heatmap to just the final-token row across all layers.
    lastRowOnly?: boolean;
}

/**
 * nnsightful LogitLensData → edulogitlens LogitLensData. Mirrors the transform
 * used in LogitLensIntroDisplay so the CM explorer sees the same cell shape.
 */
function transformToEduFormat(data: LogitLensIntroData): LogitLensData | undefined {
    if (!data) return undefined;

    const raw = data as unknown as Record<string, unknown>;
    const input = raw.input as string[] | undefined;
    const layers = raw.layers as number[] | undefined;
    const tracked = raw.tracked as Record<string, number[]>[] | undefined;
    const topk = raw.topk as string[][][] | undefined;

    if (!input || !layers || !tracked || !topk) return undefined;

    // NOTE: do NOT strip the BOS token here. CM interventions send the clicked
    // cell's token position to the backend, which indexes the BOS-inclusive
    // tokenization absolutely (causal_mediation.py). Dropping position 0 would
    // patch the wrong token. BOS-hiding for CM must happen in the widget while
    // preserving absolute positions.
    const cellData: LogitCell[][] = input.map((_, posIdx) => {
        const posTracked = tracked[posIdx] ?? {};
        return layers.map((_, layerIdx) => {
            const topTokenStrs = topk[layerIdx]?.[posIdx] ?? [];
            const topTokens = topTokenStrs.map((t) => ({
                token: t,
                prob: posTracked[t]?.[layerIdx] ?? 0,
            }));
            topTokens.sort((a, b) => b.prob - a.prob);

            const best = topTokens[0];
            return {
                token: best?.token ?? "",
                probability: best?.prob ?? 0,
                topTokens,
            };
        });
    });

    return { tokens: input, layers, data: cellData };
}

/**
 * Collapse a heatmap to just its final-token row (all layers kept). Used by the
 * "last row only" density toggle (D1): for prompts where only the final-token
 * prediction matters, the full per-position heatmap is too dense to scan.
 *
 * NOTE: this shifts token positions (the sole remaining row becomes index 0),
 * so callers that forward positions to the backend (CM interventions) must add
 * back the dropped offset — see `rowOffset` in handleIntervention below.
 */
function collapseToLastRow(data: LogitLensData | undefined): LogitLensData | undefined {
    if (!data) return data;
    const lastIdx = data.tokens.length - 1;
    if (lastIdx < 0) return data;
    return {
        tokens: [data.tokens[lastIdx]],
        layers: data.layers,
        data: [data.data[lastIdx]],
    };
}

/**
 * Append an explicit final row for the model's NEXT predicted token. In a logit
 * lens the last input position decodes to the next token; the existing rows are
 * labeled by the prompt tokens, so the model's continuation reads as if it were
 * just the last prompt token. This adds one display-only row at the bottom,
 * labeled with the predicted token (e.g. "→ Paris"), carrying that final
 * position's per-layer prediction — so the heatmap's bottom row is the model's
 * answer, not the last prompt token.
 *
 * The row is VIRTUAL (index = real token count): it has no backend token
 * position, so interventions that land on it are clamped to the last real
 * position in handleIntervention.
 */
function appendPredictionRow(data: LogitLensData | undefined): LogitLensData | undefined {
    if (!data || data.tokens.length === 0) return data;
    const lastIdx = data.tokens.length - 1;
    const lastRow = data.data[lastIdx];
    const finalLayerIdx = data.layers.length - 1;
    const predicted = lastRow?.[finalLayerIdx]?.token ?? "";
    return {
        tokens: [...data.tokens, `→${predicted}`],
        layers: data.layers,
        data: [...data.data, lastRow],
    };
}

export function CMIntroDisplay({
    sourcePrompt,
    targetPrompt,
    lensResult,
    lastRunSrcPrompt,
    lastRunTgtPrompt,
    lastRowOnly = false,
}: CMIntroDisplayProps) {
    const { chartId } = useParams<{ chartId: string }>();
    const { selectedModelIdx } = useWorkspace();

    const { data: models } = useQuery({
        queryKey: ["models"],
        queryFn: getModels,
        refetchInterval: 120000,
    });

    const selectedModel = useMemo(() => {
        if (!models || models.length === 0) return undefined;
        return models[selectedModelIdx]?.name || models[0].name;
    }, [models, selectedModelIdx]);

    // Hydrate the persisted cm-intro chart row so revisiting the page restores the intervention result.
    const { data: chart } = useQuery({
        queryKey: queryKeys.charts.chart(chartId as string),
        queryFn: () => getChartById(chartId as string),
        enabled: !!chartId,
    });

    // Source is always required; target may be absent in single-prompt mode.
    const persistedData = useMemo<CMIntroChartData | null>(() => {
        const raw = chart?.data as unknown;
        if (!raw || typeof raw !== "object") return null;
        const maybe = raw as Partial<CMIntroChartData>;
        if (!maybe.source) return null;
        return maybe as CMIntroChartData;
    }, [chart]);

    const trimmedTarget = targetPrompt.trim();
    const targetExpected = trimmedTarget.length > 0;

    // "Live" data with its provenance (what prompts produced it). The ephemeral
    // lensResult wins over persisted; we use the *RunPrompt snapshots to decide
    // whether the current textareas still match what was run.
    const liveSourceRaw = lensResult?.source ?? persistedData?.source;
    const liveTargetRaw = lensResult?.target ?? persistedData?.target;
    const liveSrcRun =
        lensResult?.source != null
            ? (lastRunSrcPrompt ?? null)
            : (persistedData?.lastRunSourcePrompt ?? null);
    const liveTgtRun =
        lensResult?.source != null
            ? (lastRunTgtPrompt ?? null)
            : (persistedData?.lastRunTargetPrompt ?? null);

    const hasAnyData = !!liveSourceRaw;
    const isStale =
        hasAnyData &&
        ((liveSrcRun !== null && liveSrcRun !== sourcePrompt) ||
            (liveTgtRun !== null && liveTgtRun !== targetPrompt));
    // No source data yet, OR target was expected (two-prompt mode) but is missing.
    const isMissingExpectedData = !liveSourceRaw || (targetExpected && !liveTargetRaw);

    const showPlaceholder = isStale || isMissingExpectedData;

    const sourceDataFull = useMemo(
        () => (showPlaceholder || !liveSourceRaw ? undefined : transformToEduFormat(liveSourceRaw)),
        [showPlaceholder, liveSourceRaw],
    );
    const targetDataFull = useMemo(
        () => (showPlaceholder || !liveTargetRaw ? undefined : transformToEduFormat(liveTargetRaw)),
        [showPlaceholder, liveTargetRaw],
    );

    // Collapsed (D1) shows just the final-token prediction already; otherwise
    // append the explicit next-predicted-token row at the bottom.
    const sourceData = useMemo(
        () => (lastRowOnly ? collapseToLastRow(sourceDataFull) : appendPredictionRow(sourceDataFull)),
        [lastRowOnly, sourceDataFull],
    );
    const targetData = useMemo(
        () => (lastRowOnly ? collapseToLastRow(targetDataFull) : appendPredictionRow(targetDataFull)),
        [lastRowOnly, targetDataFull],
    );

    // When collapsed, the sole displayed row is index 0 but maps to the final
    // absolute token position; interventions index positions absolutely, so we
    // add this offset back before forwarding to the backend.
    const srcRowOffset = lastRowOnly && sourceDataFull ? sourceDataFull.tokens.length - 1 : 0;
    const tgtRowOffset = lastRowOnly && targetDataFull ? targetDataFull.tokens.length - 1 : 0;

    // Highest real (backend-addressable) token position per prompt. The appended
    // prediction row is a virtual extra index beyond this, so clamp interventions
    // that land on it back to the last real position it represents.
    const srcMaxPos = sourceDataFull ? sourceDataFull.tokens.length - 1 : 0;
    const tgtMaxPos = targetDataFull ? targetDataFull.tokens.length - 1 : 0;

    // Undefined (not null) when absent, so CausalMediationExplorer treats the
    // result as uncontrolled and falls back to internal state populated by the
    // handleIntervention promise. When a persisted result IS present, we pass
    // it as a controlled override so revisits restore the UI.
    const persistedResultData = useMemo(() => {
        if (!persistedData?.result) return undefined;
        const transformed = transformToEduFormat(persistedData.result);
        return lastRowOnly ? collapseToLastRow(transformed) : appendPredictionRow(transformed);
    }, [persistedData, lastRowOnly]);

    const { mutateAsync: runIntervention, isPending: isInterventionPending } =
        useCMIntroIntervention();

    const handleIntervention = useCallback(
        async (i: Intervention): Promise<LogitLensData | null> => {
            if (!chartId || !selectedModel) return null;
            try {
                const result = await runIntervention({
                    model: selectedModel,
                    srcPrompt: sourcePrompt,
                    tgtPrompt: targetPrompt,
                    chartId,
                    intervention: {
                        srcTokenPos: Math.min(i.sourceTokenPosition + srcRowOffset, srcMaxPos),
                        srcLayer: i.sourceLayer,
                        tgtTokenPos: Math.min(i.targetTokenPosition + tgtRowOffset, tgtMaxPos),
                        tgtLayer: i.targetLayer,
                    },
                });
                const transformed = transformToEduFormat(result) ?? undefined;
                return (lastRowOnly ? collapseToLastRow(transformed) : appendPredictionRow(transformed)) ?? null;
            } catch {
                return null;
            }
        },
        [chartId, selectedModel, sourcePrompt, targetPrompt, runIntervention, srcRowOffset, tgtRowOffset, srcMaxPos, tgtMaxPos, lastRowOnly],
    );

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
        <div id="cm-intro-display" className="size-full overflow-auto">
            <CausalMediationExplorer
                sourcePromptText={sourcePrompt}
                targetPromptText={targetPrompt}
                sourceData={sourceData}
                targetData={targetData}
                onIntervention={handleIntervention}
                resultData={persistedResultData}
                isInterventionPending={isInterventionPending}
            />
        </div>
    );
}
