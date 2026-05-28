"use client";

import { useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/queryKeys";
import { getChartById } from "@/lib/queries/chartQueries";
import { useVlmLensImage } from "@/stores/useVlmLensImage";
import { useVlmLensView } from "@/stores/useVlmLensView";
import { VlmLensData } from "@/types/vlmLens";

import { ImageHoverWidget } from "./ImageHoverWidget";
import { SegmentationWidget } from "./SegmentationWidget";

interface VlmLensChart {
    id: string;
    data: VlmLensData | null;
    type: string;
}

/**
 * Mounts the image-hover and segmentation widgets in the input panel
 * once chart data exists. The lens table itself lives in the Display
 * panel; both surfaces share state via useVlmLensView.
 */
export function VlmLensViewPanel() {
    const { chartId } = useParams<{ chartId: string }>();

    const { data: chart } = useQuery({
        queryKey: queryKeys.charts.chart(chartId),
        queryFn: () => getChartById(chartId as string),
        enabled: !!chartId,
    });

    const ensure = useVlmLensView((s) => s.ensure);
    const imageEntry = useVlmLensImage((s) => s.byChart[chartId]);

    const c = chart as VlmLensChart | undefined;
    const data = c?.data && "meta" in c.data ? c.data : null;

    useEffect(() => {
        if (data) ensure(chartId, data.num_layers);
    }, [chartId, data?.num_layers, ensure]); // eslint-disable-line react-hooks/exhaustive-deps

    const imgPositions = useMemo(() => {
        if (!data) return [];
        const out: number[] = [];
        for (let i = 0; i < data.input_tokens.length; i++) {
            if (data.input_tokens[i].startsWith("<IMG")) out.push(i);
        }
        return out;
    }, [data]);

    if (!data) return null;

    return (
        <div className="flex flex-col gap-6 border-t pt-4 w-full items-center">
            <div className="flex flex-col gap-2 items-center" style={{ width: 320 }}>
                <h3 className="text-sm font-medium self-start">Input image</h3>
                <ImageHoverWidget
                    chartId={chartId}
                    imageUrl={imageEntry?.dataUrl ?? null}
                    imageSize={data.image_size}
                    patchSize={data.patch_size}
                    imgPositions={imgPositions}
                />
                <p className="text-xs text-muted-foreground self-start">
                    Click to lock the hovered patch · click image or table to release
                </p>
            </div>

            <div className="flex flex-col gap-2 items-stretch" style={{ width: 320 }}>
                <h3 className="text-sm font-medium">Segmentation</h3>
                <SegmentationWidget
                    chartId={chartId}
                    imageUrl={imageEntry?.dataUrl ?? null}
                    imageSize={data.image_size}
                    patchSize={data.patch_size}
                    numLayers={data.num_layers}
                    numImageTokens={data.num_image_tokens}
                    imgPositions={imgPositions}
                    topk={data.topk}
                />
            </div>
        </div>
    );
}
