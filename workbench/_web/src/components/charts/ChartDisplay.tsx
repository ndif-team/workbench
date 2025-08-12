import { useWorkspace } from "@/stores/useWorkspace";
import { Copy, Loader2, PanelRight, PanelRightClose } from "lucide-react";
import { getChartById } from "@/lib/queries/chartQueries";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useMemo, useRef, useCallback, useEffect } from "react";
import { HeatmapData, LineGraphData } from "@/types/charts";

import { HeatmapCard } from "./heatmap/HeatmapCard";
import { LineCard } from "./line/LineCard";
import CodeExport from "@/app/workbench/[workspaceId]/components/CodeExport";
import { Button } from "../ui/button";
import { toBlob } from "html-to-image";
import { toast } from "sonner";
import { BorderBeam } from "../magicui/border-beam";
import { HeatmapChart } from "@/db/schema";
import { getThumbnailPath, uploadThumbnailPublic } from "@/lib/supabase/client";
import { saveChartThumbnailUrl as saveThumbnailUrl } from "@/actions/thumbnails";

export async function captureChartAsBlob(el: HTMLElement): Promise<Blob | null> {
    try {
        const blob = await toBlob(el, {
            cacheBust: true,
            backgroundColor: getComputedStyle(document.documentElement).getPropertyValue("--background") || "#ffffff",
            pixelRatio: 1, // Low-res for thumbnail
            width: Math.min(el.clientWidth, 480),
        });
        return blob;
    } catch (e) {
        console.error("Failed to capture thumbnail", e);
        return null;
    }
}

export function ChartDisplay() {
    const { annotationsOpen, setAnnotationsOpen, jobStatus, thumbnailChartId, thumbnailCaptureNonce, clearThumbnailRequest } = useWorkspace();
    const params = useParams<{ workspaceId?: string; chartId?: string }>();
    const chartIdParam = params?.chartId as string | undefined;

    const queryClient = useQueryClient();

    // Fetch the single chart by id
    const { data: singleChart, isLoading: isLoadingSingle } = useQuery({
        queryKey: ["chartById", chartIdParam],
        queryFn: () => getChartById(chartIdParam as string),
        enabled: !!chartIdParam,
    });

    const activeChart = useMemo(() => singleChart || null, [singleChart]);

    const captureRef = useRef<HTMLDivElement | null>(null);

    // Respond to thumbnail capture requests
    useEffect(() => {
        const shouldCapture = thumbnailChartId && captureRef.current && (thumbnailChartId === chartIdParam);
        if (!shouldCapture) return;
        (async () => {
            try {
                const blob = await captureChartAsBlob(captureRef.current!);
                if (!blob) return;
                const workspaceId = params?.workspaceId as string;
                const path = getThumbnailPath(workspaceId, thumbnailChartId!);
                const publicUrl = await uploadThumbnailPublic(blob, path);
                await saveThumbnailUrl(thumbnailChartId!, publicUrl);
                // refresh sidebar list to show thumbnail
                await queryClient.invalidateQueries({ queryKey: ["chartsForSidebar", workspaceId] });
            } catch (e) {
                console.error("Thumbnail upload failed", e);
            } finally {
                clearThumbnailRequest();
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [thumbnailCaptureNonce]);

    const handleCopyPng = useCallback(async () => {
        if (!captureRef.current) return;
        try {
            const blob = await toBlob(captureRef.current, {
                cacheBust: true,
                backgroundColor: getComputedStyle(document.documentElement).getPropertyValue("--background") || "#ffffff",
                pixelRatio: 2,
            });
            if (!blob) return;
            type ClipboardItemCtor = new (items: Record<string, Blob>) => ClipboardItem;
            const ClipboardItemClass = (globalThis as unknown as { ClipboardItem?: ClipboardItemCtor }).ClipboardItem;
            if (!ClipboardItemClass) {
                console.error("Clipboard image write is not supported in this browser.");
                return;
            }
            const item = new ClipboardItemClass({ "image/png": blob });
            await navigator.clipboard.write([item as unknown as ClipboardItem]);
            toast.success("Copied to clipboard");
        } catch (err) {
            console.error("Failed to copy PNG", err);
        }
    }, []);

    if (isLoadingSingle) return (
        <div className="flex-1 flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
    );

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
                <HeatmapCard captureRef={captureRef} chart={activeChart as HeatmapChart} />
            ) : activeChart && activeChart.data !== null ? (
                <LineCard captureRef={captureRef} data={activeChart.data as LineGraphData} />
            ) : (
                <div className="flex-1 flex h-full items-center relative justify-center border m-2 border-dashed rounded">
                    {jobStatus !== "idle" && <BorderBeam duration={5}
                        size={300}
                        className="from-transparent bg-primary to-transparent" />}
                    <div className="text-muted-foreground">No chart data</div>
                </div>
            )}
        </div>
    );
}