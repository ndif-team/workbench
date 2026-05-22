"use client";

import { useIsMutating, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { queryKeys } from "@/lib/queryKeys";
import { getChartById } from "@/lib/queries/chartQueries";
import { useShallow } from "zustand/react/shallow";
import { useVlmLensView } from "@/stores/useVlmLensView";
import { VlmLensData } from "@/types/vlmLens";

import { LensTable } from "./LensTable";

interface VlmLensChart {
    id: string;
    data: VlmLensData | null;
    type: string;
}

/**
 * Display panel: just the lens table + the floating tooltip. All image-tied
 * widgets (image-hover, segmentation, sliders, legend) now live in the input
 * panel via VlmLensViewPanel. State is shared through useVlmLensView.
 */
export function VlmLensDisplay() {
    const { chartId } = useParams<{ chartId: string }>();
    const isRunning = useIsMutating({ mutationKey: ["vlm-lens"] }) > 0;

    const { data: chart, isLoading } = useQuery({
        queryKey: queryKeys.charts.chart(chartId),
        queryFn: () => getChartById(chartId as string),
        enabled: !!chartId,
    });

    const c = chart as VlmLensChart | undefined;
    const data = c?.data && "meta" in c.data ? c.data : null;

    if (isLoading) {
        return (
            <div className="flex size-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (isRunning) {
        return (
            <div className="flex size-full items-center justify-center flex-col gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Computing VLM logit lens...</p>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex size-full items-center justify-center border mx-3 mt-3 border-dashed rounded pb-6">
                <div className="text-muted-foreground text-center">
                    <p>No visualization data</p>
                    <p className="text-sm mt-2">
                        Attach an image, enter a prompt, and click &quot;Run&quot;.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="size-full min-w-0">
            <LensTable
                chartId={chartId}
                inputTokens={data.input_tokens}
                topk={data.topk}
                numLayers={data.num_layers}
            />
            <LensTooltip chartId={chartId} topk={data.topk} fallbackLayer={data.num_layers - 1} />
        </div>
    );
}

/**
 * Fixed-position tooltip floating near the cursor. Reads the shared store
 * for which (pos, layer) to display; sits at the top level so it can overlay
 * anything on the page.
 */
function LensTooltip({
    chartId,
    topk,
    fallbackLayer,
}: {
    chartId: string;
    topk: [string, string][][][];
    fallbackLayer: number;
}) {
    // Only re-render the tooltip when these specific fields change.
    const { hoveredPos, hoveredLayer, selectedLayer } = useVlmLensView(
        useShallow((s) => ({
            hoveredPos: s.byChart[chartId]?.hoveredPos ?? null,
            hoveredLayer: s.byChart[chartId]?.hoveredLayer ?? null,
            selectedLayer: s.byChart[chartId]?.selectedLayer ?? null,
        })),
    );
    const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);

    // Coalesce 60-200 Hz mousemove events to one update per animation frame.
    useEffect(() => {
        let pending = false;
        let last = { x: 0, y: 0 };
        const onMove = (e: MouseEvent) => {
            last = { x: e.clientX, y: e.clientY };
            if (pending) return;
            pending = true;
            requestAnimationFrame(() => {
                pending = false;
                setMouse({ ...last });
            });
        };
        window.addEventListener("mousemove", onMove);
        return () => window.removeEventListener("mousemove", onMove);
    }, []);

    if (hoveredPos === null || !mouse) return null;
    const layer = hoveredLayer ?? selectedLayer ?? fallbackLayer;
    const pairs = topk?.[layer]?.[hoveredPos];
    if (!pairs) return null;

    const W = 260;
    const H = 24 + pairs.length * 18;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1920;
    const vh = typeof window !== "undefined" ? window.innerHeight : 1080;
    let px = mouse.x + 12;
    let py = mouse.y + 12;
    if (px + W > vw) px = mouse.x - W - 12;
    if (py + H > vh) py = mouse.y - H - 12;
    px = Math.max(0, px);
    py = Math.max(0, py);

    return (
        <div
            className="fixed z-50 rounded border bg-popover text-popover-foreground shadow-md text-xs p-2 pointer-events-none"
            style={{ left: px, top: py, width: W }}
        >
            <div className="text-muted-foreground mb-1">Layer {layer + 1}</div>
            {pairs.map(([tok, p], i) => (
                <div key={i} className="flex justify-between font-mono">
                    <span className="truncate mr-2">{JSON.stringify(tok)}</span>
                    <span className="tabular-nums text-muted-foreground">{p}</span>
                </div>
            ))}
        </div>
    );
}
