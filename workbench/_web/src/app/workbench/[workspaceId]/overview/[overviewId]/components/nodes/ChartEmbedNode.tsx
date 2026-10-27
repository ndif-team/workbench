"use client";

import {
    DecoratorNode,
    LexicalEditor,
    NodeKey,
    SerializedLexicalNode,
    Spread,
    $getNodeByKey,
    KEY_BACKSPACE_COMMAND,
    KEY_DELETE_COMMAND,
    COMMAND_PRIORITY_LOW,
} from "lexical";
import * as React from "react";
import { getChartById, getConfigForChart } from "@/lib/queries/chartQueries";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import { Separator } from "@/components/ui/separator";
import { useParams } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { queryKeys } from "@/lib/queryKeys";
import { chartPath } from "@/lib/chartRoutes";
import { toolMeta } from "@/app/workbench/[workspaceId]/components/toolMeta";

// Node payload. `chartType` is the chart's stored type when it was embedded;
// documents saved before a tool was retired may still hold its old type.
export type ChartEmbedPayload = {
    chartId: string;
    chartType: string | null;
};

export type SerializedChartEmbedNode = Spread<
    { type: "chart-embed"; version: 1; chartId: string; chartType: string | null },
    SerializedLexicalNode
>;

export class ChartEmbedNode extends DecoratorNode<JSX.Element> {
    __chartId: string;
    __chartType: string | null;

    static getType(): string {
        return "chart-embed";
    }

    static clone(node: ChartEmbedNode): ChartEmbedNode {
        return new ChartEmbedNode(node.__chartId, node.__chartType, node.__key);
    }

    constructor(chartId: string, chartType: string | null, key?: NodeKey) {
        super(key);
        this.__chartId = chartId;
        this.__chartType = chartType;
    }

    static importJSON(serializedNode: SerializedChartEmbedNode): ChartEmbedNode {
        const node = new ChartEmbedNode(serializedNode.chartId, serializedNode.chartType);
        return node;
    }

    exportJSON(): SerializedChartEmbedNode {
        return {
            type: "chart-embed",
            version: 1,
            chartId: this.__chartId,
            chartType: this.__chartType,
        };
    }

    createDOM(): HTMLElement {
        const div = document.createElement("div");
        div.className = "my-3";
        return div;
    }

    updateDOM(): false {
        return false;
    }

    decorate(editor: LexicalEditor, config: unknown): JSX.Element {
        return (
            <ChartEmbedComponent
                nodeKey={this.getKey()}
                chartId={this.__chartId}
                chartType={this.__chartType}
            />
        );
    }
}

export function $createChartEmbedNode(payload: ChartEmbedPayload): ChartEmbedNode {
    return new ChartEmbedNode(payload.chartId, payload.chartType);
}

// React renderer that fetches the chart and shows its name, model and status
function ChartEmbedComponent({
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
    const {
        data: chart,
        isLoading: isChartLoading,
        isError: isChartError,
    } = useQuery({
        queryKey: queryKeys.charts.chart(chartId),
        queryFn: () => getChartById(chartId),
        enabled: !!chartId,
        retry: 3,
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
    const {
        data: config,
        isLoading: isConfigLoading,
        isError: isConfigError,
    } = useQuery({
        queryKey: queryKeys.charts.configByChart(chartId),
        queryFn: () => getConfigForChart(chartId),
        enabled: !!chartId,
        retry: 3,
        staleTime: 1000 * 60 * 5, // 5 minutes
    });

    React.useEffect(() => {
        return mergeRegister(
            editor.registerCommand(
                KEY_BACKSPACE_COMMAND,
                (event) => {
                    if (isSelected) {
                        event?.preventDefault();
                        editor.update(() => {
                            const node = $getNodeByKey(nodeKey);
                            if (node) {
                                node.remove();
                            }
                        });
                        return true;
                    }
                    return false;
                },
                COMMAND_PRIORITY_LOW,
            ),
            editor.registerCommand(
                KEY_DELETE_COMMAND,
                (event) => {
                    if (isSelected) {
                        event?.preventDefault();
                        editor.update(() => {
                            const node = $getNodeByKey(nodeKey);
                            if (node) {
                                node.remove();
                            }
                        });
                        return true;
                    }
                    return false;
                },
                COMMAND_PRIORITY_LOW,
            ),
        );
    }, [editor, isSelected, nodeKey]);

    const name = chart?.name ?? "Untitled";
    const modelName = (config?.data as { model?: string } | undefined)?.model;
    const toolType = config?.type ?? chart?.type ?? chartType;
    const tool = toolMeta(toolType);
    const hasData = chart?.data != null && Object.keys(chart.data).length > 0;

    const openChart = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        window.open(chartPath(workspaceId, chartId, toolType), "_blank");
    };

    return (
        <Card
            className={`p-3 rounded cursor-pointer ${isSelected ? "border-primary ring-1 ring-primary" : ""}`}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSelected(true);
                editor.focus();
            }}
            tabIndex={0}
        >
            <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{name}</span>
                <button
                    className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground"
                    onClick={openChart}
                >
                    Open <ExternalLink className="w-3 h-3" />
                </button>
            </div>
            {modelName && (
                <Badge
                    className="h-5 min-w-5 rounded-md px-1 font-mono tabular-nums"
                    variant="outline"
                >
                    {modelName}
                </Badge>
            )}
            {isChartLoading || isConfigLoading ? (
                <div className="text-sm text-muted-foreground">Loading chart…</div>
            ) : isChartError || isConfigError ? (
                <div className="text-sm text-destructive">Failed to load chart</div>
            ) : !chart ? (
                <div className="text-sm text-muted-foreground">Chart not found</div>
            ) : toolType && !tool ? (
                <div className="text-sm text-muted-foreground">Made with a retired tool</div>
            ) : !hasData ? (
                <div className="text-sm text-muted-foreground">Not run yet</div>
            ) : (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    {tool && <tool.Icon className="h-3.5 w-3.5 shrink-0" />}
                    <span>{tool ? `${tool.label} · Open to view` : "Open to view"}</span>
                </div>
            )}
        </Card>
    );
}
