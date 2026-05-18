"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery, useIsMutating } from "@tanstack/react-query";
import { getChartById } from "@/lib/queries/chartQueries";
import { queryKeys } from "@/lib/queryKeys";
import { Loader2 } from "lucide-react";
import { LogitLensGrid } from "edulogitlens";
import type { LogitLensData, LogitCell } from "edulogitlens";
import type { LogitLensIntroData } from "@/types/logitLensIntro";

interface LogitLensIntroChart {
    id: string;
    data: LogitLensIntroData | null;
    type: string;
}

/**
 * Transform the nnsightful LogitLensData format into the edulogitlens format.
 *
 * nnsightful returns:
 *   input: string[]                          — input token strings
 *   layers: number[]                         — layer indices
 *   tracked: Record<string, number[]>[]      — per-position dict of token → prob-per-layer
 *   topk: string[][][]                       — topk[layer][position] = top-k token strings
 *
 * edulogitlens expects:
 *   tokens: string[]
 *   layers: number[]
 *   data: LogitCell[][]  — data[position][layer]
 */
function transformToEduFormat(data: LogitLensIntroData): LogitLensData | null {
    if (!data) return null;

    const raw = data as Record<string, unknown>;
    const input = raw.input as string[] | undefined;
    const layers = raw.layers as number[] | undefined;
    const tracked = raw.tracked as Record<string, number[]>[] | undefined;
    const topk = raw.topk as string[][][] | undefined;

    if (!input || !layers || !tracked || !topk) return null;

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

function generateMockData(): LogitLensData {
    const tokens = [
        "The",
        "E",
        "iff",
        "el",
        "Tower",
        "is",
        "in",
        "the",
        "city",
        "of",
        "Paris",
        ",",
        "France",
        ".",
    ];
    const layers = Array.from({ length: 12 }, (_, i) => i);
    const vocab = [
        "t",
        "bow",
        "illi",
        "Tower",
        "el",
        "France",
        "Paris",
        "tower",
        "city",
        "of",
        "the",
        "in",
        "is",
        "a",
        "and",
        "Eiff",
        "to",
        "built",
        "was",
        "meters",
        "at",
        "by",
        "from",
        "with",
        "on",
        "for",
        "an",
        "stands",
        "tall",
    ];

    const data: LogitCell[][] = tokens.map((token) => {
        return layers.map((_, layerIdx) => {
            const convergence = layerIdx / layers.length;
            let primaryToken = token;
            let prob: number;

            if (convergence < 0.3) {
                primaryToken = vocab[Math.floor(Math.random() * vocab.length)];
                prob = 0.05 + Math.random() * 0.15;
            } else if (convergence < 0.6) {
                primaryToken =
                    Math.random() > 0.5 ? token : vocab[Math.floor(Math.random() * vocab.length)];
                prob = 0.2 + Math.random() * 0.3;
            } else {
                primaryToken = token;
                prob = 0.5 + convergence * 0.4 + Math.random() * 0.1;
            }
            prob = Math.min(prob, 0.95);

            const topTokens: { token: string; prob: number }[] = [{ token: primaryToken, prob }];
            let remaining = (1 - prob) * 0.4;
            for (let i = 0; i < 14; i++) {
                topTokens.push({
                    token: vocab[Math.floor(Math.random() * vocab.length)],
                    prob: remaining,
                });
                remaining *= 0.7;
            }

            return { token: primaryToken, probability: prob, topTokens };
        });
    });

    return { tokens, layers, data };
}

export function LogitLensIntroDisplay() {
    const { chartId } = useParams<{ chartId: string }>();

    const isRunning = useIsMutating({ mutationKey: ["logitLensIntro"] }) > 0;

    const { data: chart, isLoading } = useQuery({
        queryKey: queryKeys.charts.chart(chartId),
        queryFn: () => getChartById(chartId as string),
        enabled: !!chartId,
    });

    const introChart = chart as LogitLensIntroChart | undefined;
    const hasData = introChart?.data && "input" in introChart.data && "topk" in introChart.data;

    const mockData = useMemo(() => generateMockData(), []);

    if (isLoading) {
        return (
            <div className="flex size-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (isRunning) {
        return (
            <div className="flex size-full items-center justify-center flex-col gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Computing logit lens visualization...</p>
            </div>
        );
    }

    // Use real data if available, otherwise show mock data
    const eduData = hasData ? transformToEduFormat(introChart.data!) : mockData;

    if (!eduData) {
        return (
            <div className="size-full overflow-hidden p-4">
                <LogitLensGrid data={mockData} />
            </div>
        );
    }

    return (
        <div className="size-full overflow-hidden p-4">
            <LogitLensGrid data={eduData} />
        </div>
    );
}
