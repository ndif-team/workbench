"use client";

import * as React from "react";
import Link from "next/link";
import { useWorkspaceScope } from "@/components/providers/WorkspaceScopeProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Lock, LockOpen } from "lucide-react";
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
import type { LogitLensRowWindow } from "nnsightful";
import {
    chartFigure,
    chartFigureGapText,
    chartPrompt,
    rowWindowLabel,
} from "@/lib/report/chartFigure";
import { lockChart, rerunSinceLock, withView, type ChartLock } from "@/lib/report/chartLock";
import { useIsDark } from "@/hooks/useIsDark";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toolMeta } from "@/app/(shell)/components/toolMeta";
import { chartLabel } from "@/app/(shell)/components/items/itemLabel";
import type { ChartEmbedNode } from "../nodes/ChartEmbedNode";
import { EmbeddedChart } from "./EmbeddedChart";

/**
 * A chart embedded in a report (container for a ChartEmbedNode): loads the
 * chart and its config — the same queries as the chart's page, so edits made
 * there show up here — and draws it from its saved UI state. Locked, it keeps
 * the view state it had when locked instead (see chartLock.ts). A long logit
 * lens shows a window of rows, scrolled to pick the ones the report (and its
 * PDF) shows; the window's start is saved in the node. Selectable as a block;
 * Backspace / Delete removes it.
 */
export function ChartEmbed({
    nodeKey,
    chartId,
    chartType,
    lock,
    rowStart,
}: {
    nodeKey: NodeKey;
    chartId: string;
    chartType: string | null;
    lock: ChartLock | null;
    rowStart: number | null;
}) {
    const [editor] = useLexicalComposerContext();
    const queryClient = useQueryClient();
    const workspaceId = useWorkspaceScope()?.workspaceId;
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
    // Labelled as in the sidebar; with neither a name nor a prompt, no title.
    const label = chartLabel({ name: chart?.name, prompt: chartPrompt(chart, config) });
    const title = label.placeholder ? null : label.text;
    const loading = chartQuery.isLoading || configQuery.isLoading;
    const failed = chartQuery.isError || configQuery.isError;
    const figure =
        loading || failed ? null : chartFigure(chart, lock ? withView(config, lock.view) : config);
    const rerun = React.useMemo(() => !!lock && rerunSinceLock(lock, chart), [lock, chart]);

    // The rows a long logit lens's window shows. A scroll that moves the
    // window saves its start in the report; the initial window is not saved,
    // so it keeps following the default (the selected row, or the last rows).
    const [rowWindow, setRowWindow] = React.useState<LogitLensRowWindow | null>(null);
    const onRowWindowChange = React.useCallback(
        (window: LogitLensRowWindow | null, source: "render" | "scroll") => {
            setRowWindow(window);
            if (source === "scroll" && window && window.start !== rowStart) {
                editor.update(() =>
                    $getNodeByKey<ChartEmbedNode>(nodeKey)?.setRowStart(window.start),
                );
            }
        },
        [editor, nodeKey, rowStart],
    );
    const shownRows = figure?.spec?.kind === "logit-lens" ? rowWindow : null;

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
                {title && <span className="min-w-0 truncate text-sm font-medium">{title}</span>}
                {(tool || model) && (
                    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                        {tool && <span className="shrink-0">{tool.label}</span>}
                        {tool && model && <span aria-hidden="true">·</span>}
                        {model && <span className="truncate font-mono">{model}</span>}
                    </span>
                )}
                <div className="ml-auto flex shrink-0 items-center gap-1">
                    {shownRows &&
                        (isSelected ? (
                            <span className="px-1 text-xs text-muted-foreground tabular-nums">
                                {rowWindowLabel(shownRows)} · scroll to change
                            </span>
                        ) : (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="px-1 text-xs text-muted-foreground tabular-nums">
                                        {rowWindowLabel(shownRows)}
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom">
                                    Click the chart, then scroll it to choose the rows the report
                                    shows
                                </TooltipContent>
                            </Tooltip>
                        ))}
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
                            asChild
                        >
                            {/* Opens in place (Cmd/Ctrl-click: a new tab) without selecting the embed. */}
                            <Link
                                href={chartPath(chartId, toolType, workspaceId)}
                                onClick={(e) => e.stopPropagation()}
                            >
                                Open <ArrowRight className="h-3 w-3" />
                            </Link>
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
                    <EmbeddedChart
                        spec={figure.spec}
                        darkMode={darkMode}
                        rowStart={rowStart}
                        active={isSelected}
                        onRowWindowChange={onRowWindowChange}
                    />
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
