"use client";

import { useParams } from "next/navigation";
import { useQuery, useIsMutating } from "@tanstack/react-query";
import { getChartById } from "@/lib/queries/chartQueries";
import { queryKeys } from "@/lib/queryKeys";
import { ActivationPatchingData } from "@/types/activationPatching";
import { Loader2 } from "lucide-react";
import { LinePlotWidget } from "./LinePlotWidget";

interface ActivationPatchingChart {
    id: string;
    data: ActivationPatchingData | null;
    type: string;
}

export function ActivationPatchingDisplay() {
    const { chartId } = useParams<{ chartId: string }>();

    const isPatchingRunning = useIsMutating({ mutationKey: ["activationPatching"] }) > 0;

    const { data: chart, isLoading } = useQuery({
        queryKey: queryKeys.charts.chart(chartId),
        queryFn: () => getChartById(chartId as string),
        enabled: !!chartId,
    });

    const patchingChart = chart as ActivationPatchingChart | undefined;
    const hasData = patchingChart?.data && "lines" in patchingChart.data && patchingChart.data.lines.length > 0;

    // Loading state
    if (isLoading) {
        return (
            <div className="flex size-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // Computing state
    if (isPatchingRunning) {
        return (
            <div className="flex size-full items-center justify-center flex-col gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Computing activation patching...</p>
            </div>
        );
    }

    // Empty state
    if (!hasData) {
        return (
            <div className="flex size-full items-center justify-center border mx-3 mt-3 border-dashed rounded pb-6">
                <div className="text-muted-foreground text-center max-w-md">
                    <p className="text-lg font-medium mb-2">No visualization data</p>
                    <p className="text-sm">
                        Enter source and target prompts, select token positions in each,
                        then click &quot;Run Activation Patching&quot; to visualize how activations
                        transfer between prompts across model layers.
                    </p>
                </div>
            </div>
        );
    }

    // Prepare data for the line plot
    const plotData = {
        lines: patchingChart.data!.lines,
        labels: patchingChart.data!.tokenLabels || ["Source Prediction", "Clean Prediction"],
    };

    return (
        <div className="size-full overflow-auto p-4">
            <LinePlotWidget
                data={plotData}
                title="Activation Patching: Token Probability by Layer"
                yAxisLabel="Probability"
                xAxisLabel="Layer"
            />
        </div>
    );
}
