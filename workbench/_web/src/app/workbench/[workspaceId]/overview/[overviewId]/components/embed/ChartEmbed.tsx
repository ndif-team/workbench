"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Lock, LockOpen } from "lucide-react";
import {
    $getNodeByKey,
    COMMAND_PRIORITY_LOW,
    KEY_BACKSPACE_COMMAND,
    KEY_DELETE_COMMAND,
    type NodeKey,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { mergeRegister } from "@lexical/utils";
import { getChartById, getConfigForChart } from "@/lib/queries/chartQueries";
import { queryKeys } from "@/lib/queryKeys";
import { chartPath } from "@/lib/chartRoutes";
import { chartFigure, chartFigureGapText } from "@/lib/report/chartFigure";
import { lockChart, rerunSinceLock, withView, type ChartLock } from "@/lib/report/chartLock";
import { useIsDark } from "@/hooks/useIsDark";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toolMeta } from "@/app/workbench/[workspaceId]/components/toolMeta";
import type { ChartEmbedNode } from "../nodes/ChartEmbedNode";
import { EmbeddedChart } from "./EmbeddedChart";

/**
 * A chart embedded in a report (container for a ChartEmbedNode): loads the
 * chart and its config — the same queries as the chart's page, so edits made
 * there show up here — and draws it from its saved UI state. Locked, it keeps
 * the view state it had when locked instead (see chartLock.ts). Selectable as
 * a block; Backspace / Delete removes it.
 */
export function ChartEmbed({
    nodeKey,
    chartId,
    chartType,
    lock,
}: {
    nodeKey: NodeKey;
    chartId: string;
    chartType: string | null;
    lock: ChartLock | null;
}) {
    const [editor] = useLexicalComposerContext();
    const queryClient = useQueryClient();
    const { workspaceId } = useParams<{ workspaceId: string }>();
    const [isSelected, setSelected] = useLexicalNodeSelection(nodeKey);
    const darkMode = useIsDark();

    const chartQuery = useQuery({
        queryKey: queryKeys.charts.chart(chartId),
        queryFn: () => getChartById(chartId),
        enabled: !!chartId,
    });
    const configQuery = useQuery({
        queryKey: queryKeys.charts.configByChart(chartId),
        queryFn: () => getConfigForChart(chartId),
        enabled: !!chartId,
    });

    React.useEffect(() => {
        const removeIfSelected = (event: KeyboardEvent | null) => {
            if (!isSelected) return false;
            event?.preventDefault();
            editor.update(() => $getNodeByKey(nodeKey)?.remove());
            return true;
        };
        return mergeRegister(
            editor.registerCommand(KEY_BACKSPACE_COMMAND, removeIfSelected, COMMAND_PRIORITY_LOW),
            editor.registerCommand(KEY_DELETE_COMMAND, removeIfSelected, COMMAND_PRIORITY_LOW),
        );
    }, [editor, isSelected, nodeKey]);

    const chart = chartQuery.data;
    const config = configQuery.data;
    const toolType = config?.type ?? chart?.type ?? chartType;
    const tool = toolMeta(toolType);
    const model = (config?.data as { model?: string } | undefined)?.model;
    const loading = chartQuery.isLoading || configQuery.isLoading;
    const failed = chartQuery.isError || configQuery.isError;
    const figure =
        loading || failed ? null : chartFigure(chart, lock ? withView(config, lock.view) : config);
    const rerun = React.useMemo(() => !!lock && rerunSinceLock(lock, chart), [lock, chart]);

    const toggleLock = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const next = lock ? null : lockChart(chart, config);
        editor.update(() => $getNodeByKey<ChartEmbedNode>(nodeKey)?.setLock(next));
        if (!next) {
            // Unlocked: show the chart's latest state now, even one saved
            // from another tab since this report loaded it.
            void queryClient.invalidateQueries({ queryKey: queryKeys.charts.chart(chartId) });
            void queryClient.invalidateQueries({
                queryKey: queryKeys.charts.configByChart(chartId),
            });
        }
    };

    const openChart = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        window.open(chartPath(workspaceId, chartId, toolType), "_blank", "noopener");
    };

    return (
        <Card
            className={cn(
                // The editor sets pre-wrap; the chart markup expects normal white-space.
                "rounded shadow-xs cursor-pointer overflow-hidden whitespace-normal break-normal",
                isSelected && "border-primary ring-1 ring-primary",
            )}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSelected(true);
                editor.focus();
            }}
        >
            <div className="flex items-center gap-2 border-b px-3 py-1.5">
                {tool && <tool.Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 truncate text-sm font-medium">
                    {chart?.name || "Untitled"}
                </span>
                {(tool || model) && (
                    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                        {tool && <span className="shrink-0">{tool.label}</span>}
                        {tool && model && <span aria-hidden="true">·</span>}
                        {model && <span className="truncate font-mono">{model}</span>}
                    </span>
                )}
                <div className="ml-auto flex shrink-0 items-center gap-1">
                    {(lock || figure?.spec) && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    aria-pressed={!!lock}
                                    className={cn(
                                        "h-7 px-2",
                                        lock ? "text-foreground" : "text-muted-foreground",
                                    )}
                                    onClick={toggleLock}
                                >
                                    {lock ? (
                                        <Lock className="h-3 w-3" />
                                    ) : (
                                        <LockOpen className="h-3 w-3" />
                                    )}
                                    {lock ? "Locked" : "Lock"}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                                {lock
                                    ? "Unlock to show the chart's latest state"
                                    : "Keep this view: later changes to the chart won't affect it"}
                            </TooltipContent>
                        </Tooltip>
                    )}
                    {chart && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-muted-foreground"
                            onClick={openChart}
                        >
                            Open <ExternalLink className="h-3 w-3" />
                        </Button>
                    )}
                </div>
            </div>
            {rerun && (
                <p className="border-b px-3 py-1.5 text-xs text-muted-foreground">
                    This chart was re-run after you locked it: the results are new, the view is
                    still the locked one.
                </p>
            )}
            <div className="p-3" aria-live="polite">
                {loading ? (
                    <EmbedNote>Loading chart…</EmbedNote>
                ) : failed ? (
                    <EmbedNote className="text-destructive">Failed to load this chart.</EmbedNote>
                ) : figure?.spec ? (
                    <EmbeddedChart spec={figure.spec} darkMode={darkMode} />
                ) : (
                    <EmbedNote>{chartFigureGapText(figure!.gap!, tool?.label)}</EmbedNote>
                )}
            </div>
        </Card>
    );
}

function EmbedNote({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div
            className={cn(
                "flex h-24 items-center justify-center text-sm text-muted-foreground",
                className,
            )}
        >
            {children}
        </div>
    );
}
