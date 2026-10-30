"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
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
import { useIsDark } from "@/hooks/useIsDark";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toolMeta } from "@/app/workbench/[workspaceId]/components/toolMeta";
import { EmbeddedChart } from "./EmbeddedChart";

/**
 * A chart embedded in a report (container for a ChartEmbedNode): loads the
 * chart and its config — the same queries as the chart's page, so edits made
 * there show up here — and draws it from its saved UI state. Selectable as a
 * block; Backspace / Delete removes it.
 */
export function ChartEmbed({
    nodeKey,
    chartId,
    chartType,
}: {
    nodeKey: NodeKey;
    chartId: string;
    chartType: string | null;
}) {
    const [editor] = useLexicalComposerContext();
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
    const figure = loading || failed ? null : chartFigure(chart, config);

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
                <span className="truncate text-sm font-medium">{chart?.name || "Untitled"}</span>
                {model && (
                    <span className="truncate font-mono text-xs text-muted-foreground">
                        {model}
                    </span>
                )}
                {chart && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-7 shrink-0 px-2 text-muted-foreground"
                        onClick={openChart}
                    >
                        Open <ExternalLink className="h-3 w-3" />
                    </Button>
                )}
            </div>
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
