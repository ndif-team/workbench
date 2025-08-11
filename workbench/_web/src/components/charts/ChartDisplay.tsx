import { useWorkspace } from "@/stores/useWorkspace";
import { Loader2, PanelRight, PanelRightClose } from "lucide-react";
import { getLensCharts, getChartById } from "@/lib/queries/chartQueries";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { HeatmapData, LineGraphData } from "@/types/charts";

import { HeatmapCard } from "./heatmap/HeatmapCard";
import { LineCard } from "./line/LineCard";
import { Button } from "../ui/button";

export function ChartDisplay() {
    const { activeTab, setActiveTab, setAnnotationsOpen, annotationsOpen } = useWorkspace();
    const params = useParams<{ workspaceId?: string; chartId?: string }>();
    const workspaceId = params?.workspaceId as string | undefined;
    const chartIdParam = params?.chartId as string | undefined;

    // If a chartId is present in the URL, fetch that single chart; otherwise, fallback to the legacy lensCharts list
    const { data: singleChart, isLoading: isLoadingSingle } = useQuery({
        queryKey: ["chartById", chartIdParam],
        queryFn: () => getChartById(chartIdParam as string),
        enabled: !!chartIdParam,
    });

    const { data: lensCharts, isLoading: isLoadingList, isSuccess } = useQuery({
        queryKey: ["lensCharts", workspaceId],
        queryFn: () => getLensCharts(workspaceId as string),
        enabled: !chartIdParam && !!workspaceId,
    });

    const activeChart = useMemo(() => {
        if (chartIdParam) return singleChart || null;
        return lensCharts?.find(c => c.id === activeTab) || null;
    }, [singleChart, lensCharts, activeTab, chartIdParam]);

    // On load for legacy list route, set to the first chart
    const initial = useRef(true);
    useEffect(() => {
        if (!chartIdParam && isSuccess && initial.current && lensCharts && lensCharts.length > 0) {
            setActiveTab(lensCharts[0].id);
            initial.current = false;
        }
    }, [chartIdParam, isSuccess, lensCharts, setActiveTab]);

    if ((chartIdParam && isLoadingSingle) || (!chartIdParam && isLoadingList)) return (
        <div className="flex-1 flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
    );

    return (
        <div className="flex-1 flex h-full flex-col overflow-hidden custom-scrollbar relative">
            <div className="px-2 py-2 flex items-center bg-background justify-end h-12 border-b">
                <Button variant="ghost" size="icon" className="h-8 w-8 flex items-center justify-center" onClick={() => {
                    setAnnotationsOpen(!annotationsOpen);
                }}>
                    {annotationsOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
                </Button>
            </div>

            {activeChart && activeChart.type === "heatmap" && (activeChart.data !== null) ? (
                <HeatmapCard data={activeChart.data as HeatmapData} chartId={activeChart.id} initialTitle={(activeChart.data as any)?.title || ""} />
            ) : activeChart && activeChart.data !== null ? (
                <LineCard data={activeChart.data as LineGraphData} chartId={activeChart.id} initialTitle={(activeChart.data as any)?.title || ""} />
            ) : (
                <div className="flex-1 flex h-full items-center justify-center">
                    <div className="text-muted-foreground">No chart selected</div>
                </div>
            )}
        </div>
    );
}