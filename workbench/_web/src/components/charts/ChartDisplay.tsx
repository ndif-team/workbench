import { useWorkspace } from "@/stores/useWorkspace";
import { Copy, Loader2, PanelRight, PanelRightClose } from "lucide-react";
import { getChartById } from "@/lib/queries/chartQueries";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useMemo, useRef, useCallback } from "react";
import { HeatmapData, LineGraphData } from "@/types/charts";

import { HeatmapCard } from "./heatmap/HeatmapCard";
import { LineCard } from "./line/LineCard";
import CodeExport from "@/app/workbench/[workspaceId]/components/CodeExport";
import { Button } from "../ui/button";
import { toBlob } from "html-to-image";
import { toast } from "sonner";
import { BorderBeam } from "../magicui/border-beam";

export function ChartDisplay() {
    const { annotationsOpen, setAnnotationsOpen, jobStatus } = useWorkspace();
    const params = useParams<{ workspaceId?: string; chartId?: string }>();
    const chartIdParam = params?.chartId as string | undefined;

    // Fetch the single chart by id
    const { data: singleChart, isLoading: isLoadingSingle } = useQuery({
        queryKey: ["chartById", chartIdParam],
        queryFn: () => getChartById(chartIdParam as string),
        enabled: !!chartIdParam,
    });

    const activeChart = useMemo(() => singleChart || null, [singleChart]);

    const captureRef = useRef<HTMLDivElement | null>(null);

    const handleCopyPng = useCallback(async () => {
        if (!captureRef.current) return;
        try {
            const blob = await toBlob(captureRef.current);
            if (!blob) return;
            await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
            toast.success("Chart copied as PNG");
        } catch (error) {
            toast.error("Failed to copy image");
        }
    }, []);

    if (isLoadingSingle) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <Loader2 className="animate-spin" />
            </div>
        );
    }

    if (!activeChart) {
        return (
            <div className="flex-1 flex h-full items-center relative justify-center border m-2 border-dashed rounded">
                <div className="text-muted-foreground">No chart data</div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex h-full flex-col overflow-hidden custom-scrollbar relative">
            <div className="px-2 py-2 flex items-center bg-background justify-end h-12 border-b">
                <div className="flex items-center gap-2">
                    <CodeExport chartId={activeChart?.id} chartType={activeChart?.type} />
                    <Button variant="outline" size="sm" onClick={handleCopyPng}><Copy className="h-4 w-4" /> Copy</Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 flex items-center justify-center" onClick={() => {
                        setAnnotationsOpen(!annotationsOpen);
                    }}>
                        {annotationsOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
                    </Button>
                </div>
            </div>

            {activeChart && activeChart.type === "heatmap" && (activeChart.data !== null) ? (
                <HeatmapCard chartId={activeChart.id} initialName={(activeChart as any).name} captureRef={captureRef} data={activeChart.data as HeatmapData} />
            ) : activeChart && activeChart.data !== null ? (
                <LineCard chartId={activeChart.id} initialName={(activeChart as any).name} captureRef={captureRef} data={activeChart.data as LineGraphData} />
            ) : (
                <div className="flex-1 flex h-full items-center relative justify-center border m-2 border-dashed rounded">
                    <div className="text-muted-foreground">No chart data</div>
                </div>
            )}
        </div>
    );
}