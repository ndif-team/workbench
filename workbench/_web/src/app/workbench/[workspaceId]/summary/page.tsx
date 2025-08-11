"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getLensCharts } from "@/lib/queries/chartQueries";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { HeatmapCard } from "@/components/charts/heatmap/HeatmapCard";
import { LineCard } from "@/components/charts/line/LineCard";
import { HeatmapData, LineGraphData } from "@/types/charts";

// React MDEditor must be dynamically loaded client-side
const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });
const MarkdownPreview = dynamic(() => import("@uiw/react-markdown-preview"), { ssr: false });

export default function SummaryPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const [value, setValue] = useState<string>("# Summary\n\nType `/chart` to insert a chart embed, or add a code block:\n\n```chart\n<chart-id>\n```\n");
  const [openPicker, setOpenPicker] = useState(false);

  const { data: charts = [] } = useQuery({
    queryKey: ["lensCharts", workspaceId],
    queryFn: () => getLensCharts(workspaceId as string),
    enabled: !!workspaceId,
  });

  // Simple slash command detection to open the picker
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/") {
        const selection = window.getSelection();
        if (!selection) return;
        const node = selection.anchorNode;
        const text = node?.textContent || "";
        const before = text.slice(0, selection.anchorOffset);
        if (/\/(chart)?$/.test(before)) {
          setOpenPicker(true);
        }
      }
    };
    document.addEventListener("keyup", handler);
    return () => document.removeEventListener("keyup", handler);
  }, []);

  const insertChartEmbed = (chartId: string) => {
    setValue(prev => `${prev}\n\n\`\`\`chart\n${chartId}\n\`\`\`\n`);
    setOpenPicker(false);
  };

  // Custom renderers: if a fenced code block has language "chart", render inline chart by id
  const components = useMemo(() => ({
    code({ inline, children, className, ...props }: any) {
      const txt = String(children || "");
      const lang = (className || "").replace("language-", "");
      if (!inline && lang === "chart") {
        const chartId = txt.trim();
        const chart = charts.find(c => c.id === chartId);
        if (!chart) return <div className="text-xs text-muted-foreground">Chart not found: {chartId}</div>;
        if (chart.type === "heatmap") {
          return (
            <div className="my-2 border rounded">
              <HeatmapCard data={chart.data as HeatmapData} chartId={chart.id} initialTitle={(chart.data as any)?.title || ""} />
            </div>
          );
        }
        return (
          <div className="my-2 border rounded">
            <LineCard data={chart.data as LineGraphData} chartId={chart.id} initialTitle={(chart.data as any)?.title || ""} />
          </div>
        );
      }
      return <code className={className} {...props}>{children}</code>;
    },
  }), [charts]);

  return (
    <div className="h-[94vh] flex flex-col" data-color-mode="dark">
      <div className="flex items-center justify-between border-b h-12 px-2 py-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push(`/workbench/${workspaceId}/overview`)}>Overview</Button>
          <div className="text-sm text-muted-foreground">Summary</div>
        </div>
        <Dialog open={openPicker} onOpenChange={setOpenPicker}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">Insert Chart</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Select a chart to embed</DialogTitle>
            </DialogHeader>
            <div className="max-h-80 overflow-auto space-y-2">
              {charts.map((c) => (
                <Card key={c.id} className="p-2 cursor-pointer" onClick={() => insertChartEmbed(c.id)}>
                  <div className="text-sm">{(c.data as any)?.title || c.id}</div>
                  <div className="text-xs text-muted-foreground capitalize">{c.type || "unknown"}</div>
                </Card>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <div className="flex-1 min-h-0">
        <MDEditor value={value} onChange={(v) => setValue(v || "")} previewOptions={{ components }} height={"100%" as any} />
      </div>
      <div className="hidden">
        <MarkdownPreview source={value} />
      </div>
    </div>
  );
}