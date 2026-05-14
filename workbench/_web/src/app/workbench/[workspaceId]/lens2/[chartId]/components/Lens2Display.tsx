"use client";

import { useParams } from "next/navigation";
import { useQuery, useIsMutating } from "@tanstack/react-query";
import { getChartById, getConfigForChart } from "@/lib/queries/chartQueries";
import { queryKeys } from "@/lib/queryKeys";
import { Lens2Data, Lens2ConfigData } from "@/types/lens2";
import { useTheme } from "next-themes";
import { Loader2 } from "lucide-react";
import { LogitLensWidget } from "nnsightful";
import type { LogitLensData } from "nnsightful";
import { useModelsQuery } from "@/lib/api/modelsApi";
import { useWorkspace } from "@/stores/useWorkspace";
import { ChartModelPill } from "@/components/charts/ChartModelPill";
import { chartModelFromConfig, isChartStale } from "@/lib/configModelDiff";

interface Lens2Chart {
    id: string;
    data: Lens2Data | null;
    type: string;
}

interface Lens2Config {
    id: string;
    data: Lens2ConfigData;
    type: string;
}

export function Lens2Display() {
    const { chartId } = useParams<{ chartId: string }>();
    const { resolvedTheme } = useTheme();
    const isDarkMode = resolvedTheme === "dark";

    const isLens2Running = useIsMutating({ mutationKey: ["lens2"] }) > 0;

    const { data: chart, isLoading } = useQuery({
        queryKey: queryKeys.charts.chart(chartId),
        queryFn: () => getChartById(chartId as string),
        enabled: !!chartId,
    });

    const { data: config } = useQuery({
        queryKey: queryKeys.charts.configByChart(chartId),
        queryFn: () => getConfigForChart(chartId),
        enabled: !!chartId,
    });

    const { data: models } = useModelsQuery();

    const { selectedModelIdx } = useWorkspace();
    const selectedModel = models?.[selectedModelIdx]?.name ?? models?.[0]?.name ?? null;
    const modelsAvailable = !!models && models.length > 0;

    const lens2Chart = chart as Lens2Chart | undefined;
    const lens2Config = config as Lens2Config | undefined;
    const hasData = lens2Chart?.data && "meta" in lens2Chart.data;

    const chartModel = chartModelFromConfig(lens2Config, lens2Chart);
    const stale = isChartStale(chartModel, selectedModel, modelsAvailable);

    if (isLoading) {
        return (
            <div className="flex size-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (isLens2Running) {
        return (
            <div className="flex size-full items-center justify-center flex-col gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Computing logit lens visualization...</p>
            </div>
        );
    }

    if (!hasData) {
        return (
            <div className="flex size-full items-center justify-center border mx-3 mt-3 border-dashed rounded pb-6">
                <div className="text-muted-foreground text-center">
                    <p>No visualization data</p>
                    <p className="text-sm mt-2">
                        Enter a prompt and click &quot;Run Logit Lens&quot; to visualize
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="size-full overflow-auto p-4 flex flex-col gap-3">
            {stale && chartModel && (
                <div className="flex items-center gap-2 px-1">
                    <ChartModelPill modelName={chartModel} />
                </div>
            )}
            <LogitLensWidget
                data={lens2Chart.data! as LogitLensData}
                darkMode={isDarkMode}
                className="w-full min-h-[400px]"
            />
        </div>
    );
}
