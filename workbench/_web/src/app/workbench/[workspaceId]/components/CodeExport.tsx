"use client";

import { useMemo, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Code, Copy, Download } from "lucide-react";
import { pythonLanguage } from "@codemirror/lang-python";

import { getChartById, getConfigForChart } from "@/lib/queries/chartQueries";
import type { LensConfig } from "@/types/lens";
import { Button } from "@/components/ui/button";
import { queryKeys } from "@/lib/queryKeys";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

import CodeMirror from "@uiw/react-codemirror";
import { renderLensHeatmap, renderLensLine } from "@/lib/exportTemplates/lens";
import { useTheme } from "next-themes";

type Props = {
  chartId?: string;
  chartType?: "line" | "heatmap" | null;
};

export function CodeExport({ chartId, chartType }: Props) {
  const params = useParams<{ chartId?: string }>();
  const resolvedChartId = chartId || (params?.chartId as string | undefined);

  const { theme } = useTheme();

  const { data: chart } = useQuery({
    queryKey: queryKeys.charts.chart(resolvedChartId as string),
    queryFn: () => getChartById(resolvedChartId as string),
    enabled: !!resolvedChartId,
  });

  const { data: config } = useQuery({
    queryKey: queryKeys.charts.configByChart(resolvedChartId as string),
    queryFn: () => getConfigForChart(resolvedChartId as string),
    enabled: !!resolvedChartId,
  });

  const [open, setOpen] = useState(false);

  const code = useMemo(() => {
    if (!config || config.type !== "lens") {
      return "# Patching export is not implemented.";
    }

    const cfg = config.data as LensConfig;
    const type = (chartType || chart?.type) as "line" | "heatmap" | null;
    if (type === "line") return renderLensLine(cfg);
    if (type === "heatmap") return renderLensHeatmap(cfg);
    return "# No chart selected.";
  }, [config, chartType, chart]);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {}
  }, [code]);

  const filename = useMemo(() => {
    const type = (chartType || chart?.type) ?? "code";
    return `export_${type}.py`;
  }, [chartType, chart]);

  const onDownload = useCallback(() => {
    const blob = new Blob([code], { type: "text/x-python;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [code, filename]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8" variant="outline">
          <Code className="h-4 w-4" /> Code
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Export code</DialogTitle>
        </DialogHeader>
        <div className="border rounded overflow-hidden">
          <CodeMirror
            value={code}
            height="420px"
            editable={false}
            theme={theme === "dark" ? "dark" : "light"}
            extensions={[pythonLanguage]}
            basicSetup={{ lineNumbers: true }}
          />
        </div>
        <DialogFooter className="gap-3">
          <Button variant="outline" size="sm" onClick={onCopy}>
            <Copy className="h-4 w-4" /> Copy
          </Button>
          <Button size="sm" onClick={onDownload}>
            <Download className="h-4 w-4" /> Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CodeExport;
