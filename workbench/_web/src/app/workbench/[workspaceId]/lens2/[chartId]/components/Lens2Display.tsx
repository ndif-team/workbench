"use client";

import { useParams } from "next/navigation";
import { useQuery, useIsMutating } from "@tanstack/react-query";
import { getChartById, getConfigForChart } from "@/lib/queries/chartQueries";
import { getWorkspaceById } from "@/lib/queries/workspaceQueries";
import { queryKeys } from "@/lib/queryKeys";
import { Lens2Data, Lens2ConfigData } from "@/types/lens2";
import { useTheme } from "next-themes";
import { Loader2 } from "lucide-react";
import { LogitLensWidget } from "nnsightful";
import type { LogitLensData } from "nnsightful";
import { NotebookExporter } from "@/components/NotebookExporter";

interface Lens2Chart {
    id: string;
    data: Lens2Data | null;
    type: string;
    name?: string;
}

interface Lens2Config {
    id: string;
    data: Lens2ConfigData;
    type: string;
}

export function Lens2Display() {
    const { chartId, workspaceId } = useParams<{ chartId: string; workspaceId: string }>();
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

    const { data: workspace } = useQuery({
        queryKey: queryKeys.workspaces.workspace(workspaceId),
        queryFn: () => getWorkspaceById(workspaceId),
        enabled: !!workspaceId,
    });

    const lens2Chart = chart as Lens2Chart | undefined;
    const lens2Config = config as Lens2Config | undefined;
    const hasData = lens2Chart?.data && "meta" in lens2Chart.data;

    // Loading state
    if (isLoading) {
        return (
            <div className="flex size-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // Computing state
    if (isLens2Running) {
        return (
            <div className="flex size-full items-center justify-center flex-col gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Computing logit lens visualization...</p>
            </div>
        );
    }

    // Empty state
    if (!hasData) {
        return (
            <div className="flex size-full items-center justify-center border mx-3 mt-3 border-dashed rounded pb-6">
                <div className="text-muted-foreground text-center">
                    <p>No visualization data</p>
                    <p className="text-sm mt-2">Enter a prompt and click &quot;Run Logit Lens&quot; to visualize</p>
                </div>
            </div>
        );
    }

    return (
        <div className="size-full overflow-auto p-4">
            <div className="flex items-center justify-end mb-2">
                <NotebookExporter
                    configType="lens2"
                    configData={(lens2Config?.data ?? {}) as Record<string, unknown>}
                    chartData={(lens2Chart?.data ?? null) as Record<string, unknown> | null}
                    chartName={lens2Chart?.name ?? undefined}
                    workspaceName={(workspace as { name?: string } | undefined)?.name ?? undefined}
                />
            </div>
            <LogitLensWidget
                data={lens2Chart.data! as LogitLensData}
                darkMode={isDarkMode}
                className="w-full min-h-[400px]"
            />
        </div>
    );
}
