import { useWorkspace } from "@/stores/useWorkspace";
import { useLensWorkspace } from "@/stores/useLensWorkspace";
import { getChartById, getConfigForChart } from "@/lib/queries/chartQueries";
import { useIsMutating, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useMemo, useCallback, useEffect, useRef, useState } from "react";

import { HeatmapCard } from "./heatmap/HeatmapCard";
import { LineCard } from "./line/LineCard";
import { LogitLensWidgetEmbed, LogitLensWidgetInterface, SerializedPinnedRow, PinnedGroup } from "./logitlens/LogitLensWidgetEmbed";
import { normalizeToV2, isOldGridFormat, isV2Format } from "./logitlens/convertToV2";
import { HeatmapChart, LineChart } from "@/db/schema";
import { useCapture } from "@/components/providers/CaptureProvider";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { useUpdateChartName } from "@/lib/api/chartApi";

// Approximate row height in pixels for calculating maxRows
const WIDGET_ROW_HEIGHT = 26;
// Header includes: title (~30px), SVG chart (~150px), header row (~30px), footer/resize hint (~20px), padding (~110px)
const WIDGET_HEADER_HEIGHT = 340;

// Track mutation state globally via keys set in chartApi hooks

export function ChartDisplay() {
    const { jobStatus } = useWorkspace();
    const { chartId, workspaceId } = useParams<{ chartId: string; workspaceId: string }>();
    const { captureRef } = useCapture();
    const { setWidgetRef, setPinnedRows, setPinnedGroups, setTrackedTokens, setHoveredRow } = useLensWorkspace();
    const queryClient = useQueryClient();
    const updateChartName = useUpdateChartName();
    const containerRef = useRef<HTMLDivElement>(null);
    const [maxRows, setMaxRows] = useState<number | null>(null);

    const isLineRunning = useIsMutating({ mutationKey: ["lensLine"] }) > 0;
    const isHeatmapRunning = useIsMutating({ mutationKey: ["lensGrid"] }) > 0;

    // Calculate maxRows based on available viewport height
    useEffect(() => {
        const calculateMaxRows = () => {
            if (containerRef.current) {
                const availableHeight = containerRef.current.clientHeight;
                const rowsAvailable = Math.floor((availableHeight - WIDGET_HEADER_HEIGHT) / WIDGET_ROW_HEIGHT);
                // Only set maxRows if we have more than 8 tokens - otherwise let widget decide
                setMaxRows(rowsAvailable > 0 ? rowsAvailable : null);
            }
        };

        calculateMaxRows();
        window.addEventListener("resize", calculateMaxRows);
        return () => window.removeEventListener("resize", calculateMaxRows);
    }, []);

    // Track v2Data length for pinning last token
    const v2DataLengthRef = useRef(0);

    // Callbacks for widget events
    const handleWidgetReady = useCallback((widget: LogitLensWidgetInterface) => {
        setWidgetRef(widget);
        // Initialize state from widget
        const pinnedRows = widget.getPinnedRows();
        setPinnedRows(pinnedRows);
        setPinnedGroups(widget.getPinnedGroups());

        // Pin last token by default if no rows are pinned yet
        const inputLength = v2DataLengthRef.current;
        if (pinnedRows.length === 0 && inputLength > 0) {
            widget.togglePinnedRow(inputLength - 1);
        }
    }, [setWidgetRef, setPinnedRows, setPinnedGroups]);

    const handleRowPinChange = useCallback((rows: SerializedPinnedRow[]) => {
        setPinnedRows(rows);
    }, [setPinnedRows]);

    const handleGroupPinChange = useCallback((groups: PinnedGroup[]) => {
        setPinnedGroups(groups);
    }, [setPinnedGroups]);

    // Handle title change from widget - updates chart name
    const handleTitleChange = useCallback((newTitle: string) => {
        if (chartId) {
            updateChartName.mutate({ chartId, name: newTitle });
        }
    }, [chartId, updateChartName]);

    // Handle row hover from widget - syncs with TokenArea
    const handleRowHover = useCallback((pos: number | null) => {
        setHoveredRow(pos);
    }, [setHoveredRow]);

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

    // Some query is running
    const isPending = isLineRunning || isHeatmapRunning;

    // Has no data or is loading from db
    const showEmptyState =
        (jobStatus === "Idle" && chart && chart.data === null) ||
        isLoading ||
        !chart ||
        !chart.data;

    // Check if data is heatmap format (old grid format or new V2 format)
    const isHeatmapData =
        isOldGridFormat(chart?.data) || isV2Format(chart?.data);

    // Convert chart data to V2 format for the new widget
    const v2Data = useMemo(() => {
        if (!chart?.data) return null;
        const model = config?.data?.model || "unknown";
        return normalizeToV2(chart.data, model);
    }, [chart?.data, config?.data?.model]);

    // Extract tracked tokens from v2Data for autocomplete and update input length ref
    useEffect(() => {
        if (v2Data?.tracked) {
            const tokens = new Set<string>();
            v2Data.tracked.forEach((posTracked: Record<string, unknown>) => {
                Object.keys(posTracked).forEach((token) => tokens.add(token));
            });
            setTrackedTokens(Array.from(tokens));
        } else {
            setTrackedTokens([]);
        }
        // Update ref for pinning last token
        v2DataLengthRef.current = v2Data?.input?.length || 0;
    }, [v2Data, setTrackedTokens]);

    // Determine if we should use the new interactive widget
    // Use it for heatmap type charts (both old and new format data)
    const useNewWidget = isHeatmapData && v2Data !== null;

    // Only apply maxRows limit if we have more than 8 tokens
    const tokenCount = v2Data?.input?.length || 0;
    const effectiveMaxRows = tokenCount > 8 ? maxRows : null;

    return (
        <div ref={containerRef} className={cn("flex size-full overflow-y-auto", showEmptyState && "pb-6")}>
            {showEmptyState ? (
                <div className="flex size-full items-center justify-center border mx-3 mt-3 border-dashed rounded">
                    <div className="text-muted-foreground">No chart data</div>
                </div>
            ) : useNewWidget ? (
                <div ref={captureRef} className="flex size-full mx-3 mt-3">
                    <LogitLensWidgetEmbed
                        data={v2Data}
                        title={chart?.name || undefined}
                        pending={isPending}
                        maxRows={effectiveMaxRows}
                        className="w-full"
                        onWidgetReady={handleWidgetReady}
                        onRowPinChange={handleRowPinChange}
                        onGroupPinChange={handleGroupPinChange}
                        onTitleChange={handleTitleChange}
                        onRowHover={handleRowHover}
                    />
                </div>
            ) : isHeatmapRunning || (!isPending && chart.type === "heatmap") ? (
                <HeatmapCard
                    captureRef={captureRef}
                    chart={chart as HeatmapChart}
                    pending={isPending || !isHeatmapData}
                    statisticType={config?.data?.statisticType}
                />
            ) : (
                <LineCard
                    captureRef={captureRef}
                    chart={chart as LineChart}
                    pending={isPending || isHeatmapData}
                    metricType={config?.data?.statisticType}
                />
            )}
        </div>
    );
}
