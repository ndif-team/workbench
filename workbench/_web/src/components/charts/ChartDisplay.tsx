import { useWorkspace } from "@/stores/useWorkspace";
import { Loader2, PanelRight, PanelRightClose } from "lucide-react";
import { getLensCharts } from "@/lib/queries/chartQueries";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { HeatmapData, LineGraphData } from "@/types/charts";

import { HeatmapCard } from "./heatmap/HeatmapCard";
import { LineCard } from "./line/LineCard";
import { Button } from "../ui/button";

function makeE2EHeatmap(): HeatmapData {
    const rows = Array.from({ length: 8 }, (_, r) => ({
        id: `r${r}`,
        data: Array.from({ length: 12 }, (_, c) => ({ x: c, y: (Math.sin(r + c) + 1) / 2, label: "" }))
    }));
    return { rows };
}

export function ChartDisplay() {
    const { activeTab, setActiveTab, setAnnotationsOpen, annotationsOpen } = useWorkspace();
    const { workspaceId } = useParams();

    const { data: lensCharts, isLoading, isSuccess } = useQuery({
        queryKey: ["lensCharts", workspaceId],
        queryFn: () => getLensCharts(workspaceId as string),
    });

    const activeChart = useMemo(() => {
        return lensCharts?.find(c => c.id === activeTab) || null;
    }, [lensCharts, activeTab]);

    // On load, set to the first chart
    const initial = useRef(true);
    useEffect(() => {
        if (isSuccess && initial.current && lensCharts.length > 0) {
            setActiveTab(lensCharts[0].id);
            initial.current = false;
        }
    }, [isSuccess, lensCharts, setActiveTab]);

    if (isLoading) return (
        <div className="flex-1 flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
    );

    const isE2E = typeof window !== 'undefined' && (process.env.NEXT_PUBLIC_E2E === 'true');

    return (
        <div className="flex-1 flex h-full flex-col overflow-hidden custom-scrollbar relative">
            <div className="px-2 py-2 flex items-center bg-background justify-end h-12 border-b">
                <Button variant="ghost" size="icon" className="h-8 w-8 flex items-center justify-center" onClick={() => {
                    setAnnotationsOpen(!annotationsOpen);
                }} data-testid="toggle-annotations">
                    {annotationsOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
                </Button>
            </div>

            {activeChart && activeChart.type === "heatmap" && (activeChart.data !== null) ? (
                <HeatmapCard data={activeChart.data as HeatmapData} />
            ) : activeChart && activeChart.data !== null ? (
                <LineCard data={activeChart.data as LineGraphData} />
            ) : isE2E && activeTab ? (
                <HeatmapCard data={makeE2EHeatmap()} />
            ) : (
                <div className="flex-1 flex h-full items-center justify-center" data-testid="no-chart">
                    <div className="text-muted-foreground">No chart selected</div>
                </div>
            )}
        </div>
    );
}