"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getChartsForSidebar, type ToolTypedChart } from "@/lib/queries/chartQueries";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import LineChartStatic from "@/components/charts/line/LineChartStatic";
import HeatmapStatic from "@/components/charts/heatmap/HeatmapStatic";
import type EditorJS from "@editorjs/editorjs";
import type { OutputData } from "@editorjs/editorjs";
import Fuse from "fuse.js";
import ReactDOM from "react-dom/client";

// Dynamic import tools
const Header = dynamic(() => import("@editorjs/header").then(m => m.default as any), { ssr: false });
const List = dynamic(() => import("@editorjs/list").then(m => m.default as any), { ssr: false });

export default function OverviewEditorPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const editorRef = useRef<EditorJS | null>(null);
  const holderRef = useRef<HTMLDivElement | null>(null);

  const { data: charts = [] } = useQuery<ToolTypedChart[]>({
    queryKey: ["chartsForSidebar", workspaceId],
    queryFn: () => getChartsForSidebar(workspaceId),
    enabled: !!workspaceId,
  });

  const fuse = useMemo(() => new Fuse(charts, { keys: ["name"], threshold: 0.4 }), [charts]);

  // Load initial content
  const [initialContent, setInitialContent] = useState<OutputData | null>(null);
  useEffect(() => {
    if (!workspaceId) return;
    (async () => {
      const res = await fetch(`/api/workspaces/${workspaceId}/overview`);
      const json = await res.json();
      setInitialContent(json.content);
    })();
  }, [workspaceId]);

  // Chart Block Tool
  const ChartBlockTool = useMemo(() => {
    return class ChartBlockToolImpl {
      static get toolbox() {
        return { title: "Chart", icon: "📈" };
      }
      private data: { chartId?: string };
      private wrapper: HTMLElement;
      constructor({ data }: any) {
        this.data = data || {};
        this.wrapper = document.createElement("div");
        this.wrapper.className = "my-2";
      }
      render() {
        this._renderAsync();
        return this.wrapper;
      }
      async _renderAsync() {
        const chartId = this.data?.chartId;
        if (!chartId) {
          this.wrapper.innerHTML = '<div class="text-sm text-muted-foreground">No chart selected</div>';
          return;
        }
        try {
          const res = await fetch(`/api/charts/${chartId}`);
          if (!res.ok) throw new Error("not found");
          const chart = await res.json();
          this.wrapper.innerHTML = "";
          const mount = document.createElement("div");
          this.wrapper.appendChild(mount);
          const root = ReactDOM.createRoot(mount);
          if (chart.type === "heatmap" && chart.data) {
            root.render(<HeatmapStatic data={chart.data} />);
          } else if (chart.data) {
            root.render(<LineChartStatic data={chart.data} />);
          } else {
            this.wrapper.innerHTML = '<div class="text-sm text-muted-foreground">Chart has no data</div>';
          }
        } catch (e) {
          this.wrapper.innerHTML = '<div class="text-sm text-muted-foreground">Chart not found</div>';
        }
      }
      save() {
        return { chartId: this.data?.chartId };
      }
      static get isReadOnlySupported() { return true; }
    };
  }, []);

  // Initialize EditorJS
  useEffect(() => {
    if (!initialContent) return;
    let destroyed = false;
    (async () => {
      const Editor = (await import("@editorjs/editorjs")).default;
      if (destroyed) return;
      const editor = new Editor({
        holder: holderRef.current!,
        tools: {
          header: Header as any,
          list: List as any,
          chart: ChartBlockTool as any,
        },
        data: initialContent,
        placeholder: "Type '/' for commands…",
      });
      editorRef.current = editor;
    })();
    return () => { destroyed = true; editorRef.current?.destroy(); editorRef.current = null; };
  }, [initialContent, ChartBlockTool]);

  // Slash menu state
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  const filteredCharts = useMemo(() => {
    if (!slashQuery) return charts.slice(0, 10);
    return fuse.search(slashQuery).map(r => r.item).slice(0, 10);
  }, [charts, fuse, slashQuery]);

  // Key handling
  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!slashOpen) {
        if (e.key === "/") {
          setSlashOpen(true);
          setSlashQuery("");
          setHighlightIdx(0);
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            const rect = sel.getRangeAt(0).getBoundingClientRect();
            setMenuPos({ x: rect.left, y: rect.bottom + 8 });
          }
        }
        return;
      }
      // When open
      if (e.key === "Escape") { setSlashOpen(false); return; }
      if (e.key === "Backspace" && slashQuery === "") { setSlashOpen(false); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, Math.max(0, filteredCharts.length - 1))); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter") {
        e.preventDefault();
        const chosen = filteredCharts[highlightIdx];
        if (chosen) {
          insertChartBlock(chosen.id);
        }
        setSlashOpen(false);
        return;
      }
      const key = e.key.length === 1 ? e.key : "";
      if (key) {
        // Accept letters and space after /chart
        setSlashQuery((prev) => prev + key);
      }
    };
    holder.addEventListener("keydown", onKeyDown);
    return () => holder.removeEventListener("keydown", onKeyDown);
  }, [slashOpen, filteredCharts, highlightIdx]);

  const insertChartBlock = useCallback(async (chartId: string) => {
    if (!editorRef.current) return;
    const api: any = editorRef.current;
    api.blocks.insert("chart", { chartId });
  }, []);

  const handleSave = useCallback(async () => {
    if (!editorRef.current || !workspaceId) return;
    const data = await editorRef.current.save();
    const res = await fetch(`/api/workspaces/${workspaceId}/overview`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: data }) });
    if (res.ok) toast.success("Saved"); else toast.error("Failed to save");
  }, [workspaceId]);

  return (
    <div className="flex flex-col h-[94vh]">
      <div className="h-12 px-3 py-2 border-b flex items-center justify-between">
        <span className="text-sm font-medium">Overview</span>
        <Button size="sm" onClick={handleSave}>Save</Button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <div ref={holderRef} className="prose max-w-none" />
      </div>
      {slashOpen && menuPos && (
        <div style={{ position: "fixed", left: menuPos.x, top: menuPos.y, zIndex: 50 }} className="w-96 bg-popover border rounded shadow">
          <div className="p-2 border-b text-xs text-muted-foreground">Insert chart</div>
          <div className="max-h-80 overflow-auto">
            {filteredCharts.length === 0 ? (
              <div className="text-xs text-muted-foreground p-3">No matches</div>
            ) : (
              filteredCharts.map((c, idx) => (
                <div key={c.id} className={`px-3 py-2 text-sm cursor-pointer flex items-center justify-between ${idx === highlightIdx ? 'bg-accent' : ''}`} onMouseEnter={() => setHighlightIdx(idx)} onMouseDown={(e) => { e.preventDefault(); insertChartBlock(c.id); setSlashOpen(false); }}>
                  <div className="truncate mr-2">
                    <div className="font-medium truncate">{c.name || 'Untitled Chart'}</div>
                    <div className="text-xs text-muted-foreground">{c.chartType ?? 'unknown'} • {c.annotationCount} annotations</div>
                  </div>
                  <div className="text-[10px] text-muted-foreground">{new Date(c.updatedAt).toLocaleDateString()}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}