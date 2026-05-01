"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { TrajectoryComparison } from "@/components/branching/TrajectoryComparison";
import { useBranchingContinue } from "@/lib/api/branchingApi";
import { getChartById, getConfigForChart } from "@/lib/queries/chartQueries";
import { queryKeys } from "@/lib/queryKeys";
import type {
    BranchingChartData,
    BranchingConfigData,
} from "@/types/branching";
import type {
    BranchingDrillDown,
    BranchingGenerationSet,
} from "@/types/workshop";

export function BranchingDisplay() {
    const { chartId } = useParams<{ chartId: string }>();

    const { data: chart } = useQuery({
        queryKey: queryKeys.charts.chart(chartId),
        queryFn: () => getChartById(chartId as string),
        enabled: !!chartId,
    });
    const { data: configRow } = useQuery({
        queryKey: queryKeys.charts.configByChart(chartId),
        queryFn: () => getConfigForChart(chartId as string),
        enabled: !!chartId,
    });

    const continueMutation = useBranchingContinue();

    const config = configRow?.data as BranchingConfigData | undefined;
    const chartData = chart?.data as BranchingChartData | undefined;

    if (!config) {
        return (
            <div className="size-full flex items-center justify-center text-sm text-muted-foreground">
                Loading config…
            </div>
        );
    }

    if (!chartData || chartData.samples.length === 0) {
        return (
            <div
                data-testid="branching-empty"
                className="size-full flex items-center justify-center text-sm text-muted-foreground"
            >
                Set parameters on the left and click <strong className="mx-1">Generate
                variations</strong> to begin.
            </div>
        );
    }

    const payload: BranchingGenerationSet = {
        record_type: "branching_generation_set",
        example_id: chart?.id ?? "researcher",
        prompt: config.prompt,
        model: config.model,
        max_tokens: config.max_tokens,
        samples: chartData.samples,
        drill_downs: chartData.drill_downs ?? [],
    };

    const onExportInif = () => {
        const exportPayload = {
            ...payload,
            critical_framing_prompt: null,
            pedagogical_narrative: null,
            risk_flag: null,
        };
        const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `branching-${chart?.id ?? "researcher"}.inif.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="size-full flex flex-col gap-3 p-4 overflow-auto">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium" data-testid="branching-display-header">
                    Generated trajectories
                </h2>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    data-testid="branching-export-inif"
                    onClick={onExportInif}
                >
                    Export INIF
                </Button>
            </div>
            <TrajectoryComparison
                payload={payload}
                generateAlternate={async (input) => {
                    const sample = payload.samples[input.sampleIdx];
                    const prefixIds = sample.completion_tokens
                        .slice(0, input.position)
                        .map((t) => t.id);
                    const dd: BranchingDrillDown = await continueMutation.mutateAsync({
                        chartId: chartId as string,
                        model: payload.model,
                        prompt: payload.prompt,
                        sample_idx: input.sampleIdx,
                        branch_position: input.position,
                        prefix_token_ids: prefixIds,
                        forced_next_token_id: input.forcedTokenId,
                        forced_next_token_text: input.forcedTokenText,
                        max_tokens: 60,
                    });
                    return dd;
                }}
            />
        </div>
    );
}
