"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { Grid3X3, ChartLine, Trash2, Copy, MoreVertical, GitBranch } from "lucide-react";
import { ChartMetadata, ChartType, ToolType } from "@/types/charts";
import { PatchLensIcon } from "@/components/PatchLensIcon";
import { JLensIcon } from "@/components/JLensIcon";
import { cn } from "@/lib/utils";
import { ChartRenameDialog } from "./ChartRenameDialog";
import { sidebarCardShell } from "./sidebarCardShell";
import { useCopyChart } from "@/lib/api/chartApi";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type ChartCardProps = {
    metadata: ChartMetadata;
    handleDelete: (e: React.MouseEvent, chartId: string) => void;
    canDelete: boolean;
    /** True while this (empty) chart is being converted to another tool. The
     * card shows a "Switching…" indicator in place of its tool label. */
    switching?: boolean;
};

/** tool → label + icon. Keyed by the chart's rendered `chartType` when it has
 * one, else its `toolType` — so a chart that hasn't been run yet (chartType is
 * null until data lands) still shows its tool instead of "unknown". Covers both
 * unions; the legacy `lens`/`patch` tool types round out the ToolType side. */
const TOOL_META: Record<
    ChartType | ToolType,
    { label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
    line: { label: "Line", Icon: ChartLine },
    heatmap: { label: "Heatmap", Icon: Grid3X3 },
    lens: { label: "Logit Lens", Icon: Grid3X3 },
    lens2: { label: "Logit Lens", Icon: Grid3X3 },
    jlens: { label: "J-Lens", Icon: JLensIcon },
    patch: { label: "Act. Patching", Icon: GitBranch },
    "activation-patching": { label: "Act. Patching", Icon: GitBranch },
    "patch-lens": { label: "Patch Lens", Icon: PatchLensIcon },
};

export default function ChartCard({
    metadata,
    handleDelete,
    canDelete,
    switching = false,
}: ChartCardProps) {
    const { workspaceId, chartId } = useParams<{ workspaceId: string; chartId: string }>();
    const copyChart = useCopyChart();
    const router = useRouter();

    const isSelected = chartId === metadata.id;
    const updatedAt = metadata.updatedAt
        ? new Date(metadata.updatedAt).toLocaleDateString("en-US", {
              month: "numeric",
              day: "numeric",
          })
        : "";

    // Prefer the rendered chartType (set once the chart has data); fall back to
    // the tool type so unrun/just-created charts still label their tool.
    const toolKey = metadata.chartType ?? metadata.toolType;
    const tool = toolKey ? TOOL_META[toolKey] : undefined;

    const navigateToChart = (chart: ChartMetadata) => {
        if (chart.toolType === "lens2" || chart.chartType === "lens2") {
            router.push(`/workbench/${workspaceId}/lens2/${chart.id}`);
        } else if (chart.toolType === "jlens" || chart.chartType === "jlens") {
            router.push(`/workbench/${workspaceId}/j-lens/${chart.id}`);
        } else if (
            chart.toolType === "activation-patching" ||
            chart.chartType === "activation-patching"
        ) {
            router.push(`/workbench/${workspaceId}/activation-patching/${chart.id}`);
        } else if (chart.toolType === "patch-lens" || chart.chartType === "patch-lens") {
            router.push(`/workbench/${workspaceId}/patch-lens/${chart.id}`);
        } else {
            router.push(`/workbench/${workspaceId}/${chart.id}`);
        }
    };

    const handleCopy = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        try {
            const newChart = await copyChart.mutateAsync(id);
            toast.success("Chart copied successfully");
            navigateToChart({ ...metadata, id: newChart.id });
        } catch (error) {
            console.error("Failed to copy chart:", error);
            toast.error("Failed to copy chart");
        }
    };

    return (
        <div
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
            className={cn(sidebarCardShell({ selected: isSelected }), switching && "bg-primary/5")}
            onClick={() => navigateToChart(metadata)}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigateToChart(metadata);
                }
            }}
            draggable
            onDragStart={(e) => {
                try {
                    e.dataTransfer.setData(
                        "application/x-chart",
                        JSON.stringify({
                            chartId: metadata.id,
                            chartType: metadata.chartType ?? null,
                        }),
                    );
                    e.dataTransfer.effectAllowed = "copy";
                } catch {}
            }}
        >
            {/* line 1: title + overflow menu */}
            <div className="flex items-center justify-between gap-2">
                <span
                    className={cn(
                        "truncate text-sm leading-tight text-foreground",
                        isSelected ? "font-semibold" : "font-medium",
                    )}
                >
                    {metadata.name || "Untitled"}
                </span>

                <Popover>
                    <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <button
                            type="button"
                            aria-label="Chart actions"
                            className="-m-0.5 shrink-0 rounded p-0.5 text-muted-foreground/40 transition-colors hover:bg-accent hover:text-foreground focus-visible:text-foreground group-hover:text-muted-foreground"
                        >
                            <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-40 p-1" align="end">
                        <button
                            className="flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-sm hover:bg-accent"
                            onClick={(e) => handleCopy(e, metadata.id)}
                        >
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copy</span>
                        </button>
                        <ChartRenameDialog
                            chartId={metadata.id}
                            chartName={metadata.name || ""}
                            triggerClassName="flex w-full items-center gap-3 px-3 py-2.5 text-sm hover:bg-accent rounded-sm"
                        />
                        <button
                            className={cn(
                                "flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-sm text-destructive hover:bg-accent",
                                !canDelete && "cursor-not-allowed opacity-40",
                            )}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(e, metadata.id);
                            }}
                            disabled={!canDelete}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Delete</span>
                        </button>
                    </PopoverContent>
                </Popover>
            </div>

            {/* line 2: tool (left) · date (right, never truncates). While
                switching tools, the left slot becomes a spinner + "Switching…"
                that gently shimmers, matching the deploy card's loading look. */}
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                {switching ? (
                    <span
                        aria-live="polite"
                        className="flex min-w-0 items-center gap-1.5 truncate text-primary motion-safe:animate-pulse"
                    >
                        <span
                            aria-hidden
                            className="brand-spinner inline-block size-3 shrink-0 motion-safe:animate-spin [animation-duration:1.4s]"
                        />
                        <span className="truncate">Switching…</span>
                    </span>
                ) : (
                    <span className="flex min-w-0 items-center gap-1.5 truncate">
                        {tool ? (
                            <>
                                <tool.Icon className="h-3 w-3 shrink-0 opacity-80" />
                                <span className="truncate">{tool.label}</span>
                            </>
                        ) : (
                            <span className="truncate opacity-60">unknown</span>
                        )}
                    </span>
                )}
                {updatedAt && <span className="shrink-0 tabular-nums">{updatedAt}</span>}
            </div>
        </div>
    );
}
