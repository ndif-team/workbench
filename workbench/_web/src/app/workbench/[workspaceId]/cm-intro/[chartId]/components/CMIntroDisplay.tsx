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

interface CMIntroDisplayProps {
    sourcePrompt: string;
    targetPrompt: string;
    lensResult?: CMIntroLensResult | null;
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

export function CMIntroDisplay({ sourcePrompt, targetPrompt, lensResult }: CMIntroDisplayProps) {
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

    const persistedData = useMemo<CMIntroChartData | null>(() => {
        const raw = chart?.data as unknown;
        if (!raw || typeof raw !== "object") return null;
        const maybe = raw as Partial<CMIntroChartData>;
        if (!maybe.source || !maybe.target) return null;
        return maybe as CMIntroChartData;
    }, [chart]);

    // Prefer the ephemeral prop result (just-computed this session), otherwise fall back to persisted.
    const sourceData = useMemo(() => {
        if (lensResult?.source) return transformToEduFormat(lensResult.source);
        if (persistedData?.source) return transformToEduFormat(persistedData.source);
        return undefined;
    }, [lensResult, persistedData]);

    const targetData = useMemo(() => {
        if (lensResult?.target) return transformToEduFormat(lensResult.target);
        if (persistedData?.target) return transformToEduFormat(persistedData.target);
        return undefined;
    }, [lensResult, persistedData]);

    // Undefined (not null) when absent, so CausalMediationExplorer treats the
    // result as uncontrolled and falls back to internal state populated by the
    // handleIntervention promise. When a persisted result IS present, we pass
    // it as a controlled override so revisits restore the UI.
    const persistedResultData = useMemo(() => {
        if (!persistedData?.result) return undefined;
        return transformToEduFormat(persistedData.result);
    }, [persistedData]);

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
        [chartId, selectedModel, sourcePrompt, targetPrompt, runIntervention],
    );

    return (
        <div className="size-full overflow-auto">
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
