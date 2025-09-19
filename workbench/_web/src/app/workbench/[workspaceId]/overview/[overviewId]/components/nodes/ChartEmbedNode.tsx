"use client";

import { DecoratorNode, LexicalEditor, NodeKey, SerializedLexicalNode, Spread, $getNodeByKey, KEY_BACKSPACE_COMMAND, KEY_DELETE_COMMAND, COMMAND_PRIORITY_LOW } from "lexical";
import * as React from "react";
import { getChartById } from "@/lib/queries/chartQueries";
import type { ChartMetadata } from "@/types/charts";
import { useQuery } from "@tanstack/react-query";
import { StaticHeatmapCard } from "@/components/charts/heatmap/StaticHeatmapCard";
import { Card } from "@/components/ui/card";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import { StaticLineCard } from "@/components/charts/line/StaticLineCard";
import { HeatmapChart, LineChart } from "@/db/schema";
import { Separator } from "@/components/ui/separator";
// no-op

// Command payload and command export
import { createCommand } from "lexical";
import { useParams } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/queryKeys";
export const INSERT_CHART_EMBED_COMMAND = createCommand<{ chart: ChartMetadata }>("INSERT_CHART_EMBED_COMMAND");

// Node payload
export type ChartEmbedPayload = {
  chartId: string;
  chartType: "line" | "heatmap" | null;
};

export type SerializedChartEmbedNode = Spread<{ type: "chart-embed"; version: 1; chartId: string; chartType: "line" | "heatmap" | null }, SerializedLexicalNode>;

export class ChartEmbedNode extends DecoratorNode<JSX.Element> {
  __chartId: string;
  __chartType: "line" | "heatmap" | null;

  static getType(): string {
    return "chart-embed";
  }

  static clone(node: ChartEmbedNode): ChartEmbedNode {
    return new ChartEmbedNode(node.__chartId, node.__chartType, node.__key);
  }

  constructor(chartId: string, chartType: "line" | "heatmap" | null, key?: NodeKey) {
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
    return <ChartEmbedComponent nodeKey={this.getKey()} chartId={this.__chartId} chartType={this.__chartType} />;
  }
}

export function $createChartEmbedNode(payload: ChartEmbedPayload): ChartEmbedNode {
  return new ChartEmbedNode(payload.chartId, payload.chartType);
}

// React renderer that fetches chart and renders a static version
function ChartEmbedComponent({ nodeKey, chartId, chartType }: { nodeKey: NodeKey; chartId: string; chartType: "line" | "heatmap" | null }) {
  const [editor] = useLexicalComposerContext();
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [isSelected, setSelected] = useLexicalNodeSelection(nodeKey);
  const { data: chart } = useQuery({ queryKey: queryKeys.charts.chart(chartId), queryFn: () => getChartById(chartId) });

  const [size, setSize] = useState<"small" | "medium" | "large">("medium");

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
        COMMAND_PRIORITY_LOW
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
        COMMAND_PRIORITY_LOW
      )
    );
  }, [editor, isSelected, nodeKey]);

  const name = (chart?.name ?? "Untitled");
  const type = (chart?.type ?? chartType);

  const openChart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(`/workbench/${workspaceId}/${chartId}`, '_blank');
  }

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
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground">{name}</span>
        <div className="flex items-center gap-2">
          <Select value={size} onValueChange={(value) => setSize(value as "small" | "medium" | "large")}>
            <SelectTrigger className={cn("w-fit gap-1 border-none !bg-transparent p-0 text-xs text-muted-foreground hover:text-foreground")}>
              <SelectValue />
            </SelectTrigger>

            <SelectContent align="center">
              <SelectItem value="small">Small</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="large">Large</SelectItem>
            </SelectContent>
          </Select>

          <button className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground" onClick={openChart}>
            Open <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>
      {!chart ? (
        <div className="text-sm text-muted-foreground">Loading chart…</div>
      ) : type === "line" && chart.data ? (
        <div className={cn("w-full", {
          "h-[40vh]": size === "small",
          "h-[60vh]": size === "medium",
          "h-[80vh]": size === "large",
        })}>
          <StaticLineCard chart={chart as LineChart} />
        </div>
      ) : type === "heatmap" && chart.data ? (
        <div className={cn("w-full", {
          "h-[40vh]": size === "small",
          "h-[60vh]": size === "medium",
          "h-[80vh]": size === "large",
        })}>
          <StaticHeatmapCard chart={chart as HeatmapChart} />
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">No data available</div>
      )}
    </Card>
  );
}
