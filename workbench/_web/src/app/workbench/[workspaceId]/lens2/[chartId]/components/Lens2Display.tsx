"use client";

import { useParams } from "next/navigation";
import { useQuery, useIsMutating } from "@tanstack/react-query";
import { getChartById } from "@/lib/queries/chartQueries";
import { queryKeys } from "@/lib/queryKeys";
import { Lens2Data } from "@/types/lens2";
import { useTheme } from "next-themes";
import { Loader2 } from "lucide-react";
import { LogitLensWidgetWrapper } from "./LogitLensWidgetWrapper";

interface Lens2Chart {
    id: string;
    data: Lens2Data | null;
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

    const lens2Chart = chart as Lens2Chart | undefined;
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
            <LogitLensWidgetWrapper
                data={lens2Chart.data!}
                darkMode={isDarkMode}
            />
        </div>
    );
}
