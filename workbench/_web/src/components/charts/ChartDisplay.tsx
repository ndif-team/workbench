import { useWorkspace } from "@/stores/useWorkspace";
import { getChartById } from "@/lib/queries/chartQueries";
import { useIsMutating, useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

import { HeatmapCard } from "./heatmap/HeatmapCard";
import { LineCard } from "./line/LineCard";
import { HeatmapChart, LineChart } from "@/db/schema";
import { useCapture } from "@/components/providers/CaptureProvider";
import { queryKeys } from "@/lib/queryKeys";

// Track mutation state globally via keys set in chartApi hooks

export function ChartDisplay() {
    const { jobStatus } = useWorkspace();
    const { chartId } = useParams<{ chartId: string }>();
    const { captureRef } = useCapture();

    const isLineRunning = useIsMutating({ mutationKey: ["lensLine"] }) > 0;
    const isHeatmapRunning = useIsMutating({ mutationKey: ["lensGrid"] }) > 0;

    const { data: chart, isLoading } = useQuery({
        queryKey: queryKeys.charts.chart(chartId),
        queryFn: () => getChartById(chartId as string),
        enabled: !!chartId,
    });

    if (!chart) {
        return <div>Error: No chart found</div>;
    }

    // Some query is running
    const isPending = isLineRunning || isHeatmapRunning;

    // Has no data or is loading from db
    const showEmptyState = (jobStatus === "Idle" && chart.data === null) || isLoading;

    return (
        <div className="flex size-full">
            {showEmptyState ? (
                <div className="flex-1 flex h-full items-center relative justify-center border m-3 border-dashed rounded">
                    <div className="text-muted-foreground">No chart data</div>
                </div>
            ) : isHeatmapRunning || (!isPending && chart.type === "heatmap") ? (
                <HeatmapCard captureRef={captureRef} chart={chart as HeatmapChart} pending={isPending} />
            ) : (
                <LineCard captureRef={captureRef} chart={chart as LineChart} pending={isPending} />
            )}
        </div>
    );
}