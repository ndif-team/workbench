"use client";

import { useQuery } from "@tanstack/react-query";
import { getChartsForSidebar, type ToolTypedChart } from "@/lib/queries/chartQueries";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Grid3X3, ChartLine, Search, ReplaceAll, Trash2 } from "lucide-react";
import { useWorkspace } from "@/stores/useWorkspace";
import { useCreateLensChartPair, useCreatePatchChartPair, useDeleteChart } from "@/lib/api/chartApi";

export default function ChartCardsSidebar() {
    const { workspaceId } = useParams();
    const router = useRouter();
    const { activeTab, setActiveTab, selectedModel } = useWorkspace();

    const { data: charts = [], isLoading } = useQuery<ToolTypedChart[]>({
        queryKey: ["chartsForSidebar", workspaceId],
        queryFn: () => getChartsForSidebar(workspaceId as string),
    });

    const { mutate: createLensPair, isPending: isCreatingLens } = useCreateLensChartPair();
    const { mutate: createPatchPair, isPending: isCreatingPatch } = useCreatePatchChartPair();
    const { mutate: deleteChart, isPending: isDeleting } = useDeleteChart();

    const navigateToChart = (chartId: string) => {
        setActiveTab(chartId);
        router.push(`/workbench/${workspaceId}/${chartId}`);
    };

    const handleChartClick = (chart: ToolTypedChart) => {
        navigateToChart(chart.id);
    };

    const handleCreate = (toolType: "lens" | "patch") => {
        if (toolType === "lens") {
            createLensPair({
                workspaceId: workspaceId as string,
                defaultConfig: {
                    prompt: "",
                    model: selectedModel?.name || "",
                    token: { idx: 0, id: 0, text: "", targetIds: [] },
                },
            }, {
                onSuccess: ({ chart }) => navigateToChart(chart.id)
            });
        } else {
            createPatchPair({
                workspaceId: workspaceId as string,
                defaultConfig: {
                    edits: [],
                    model: selectedModel?.name || "",
                    source: "",
                    destination: "",
                    submodule: "attn",
                    correctId: 0,
                    incorrectId: undefined,
                    patchTokens: false,
                },
            }, {
                onSuccess: ({ chart }) => navigateToChart(chart.id)
            });
        }
    };

    const handleDelete = (e: React.MouseEvent, chartId: string) => {
        e.stopPropagation();
        if (!charts || charts.length <= 1) return;
        // Choose next chart to focus
        const remaining = charts.filter(c => c.id !== chartId);
        const nextId = remaining[0]?.id;
        deleteChart(chartId, {
            onSuccess: () => {
                if (nextId) navigateToChart(nextId);
            }
        });
    };

    if (!charts) return null;

    const formatToolType = (toolType: ToolTypedChart["toolType"]) => {
        if (!toolType) return "Unknown";
        return toolType === "lens" ? "Lens" : toolType === "patch" ? "Patch" : toolType;
    };

    const renderToolIcon = (toolType: ToolTypedChart["toolType"]) => {
        if (toolType === "lens") return <Search className="h-4 w-4" />;
        if (toolType === "patch") return <ReplaceAll className="h-4 w-4" />;
        return <Search className="h-4 w-4 opacity-50" />;
    };

    const renderChartTypeMini = (chartType: ToolTypedChart["chartType"]) => {
        if (chartType === "line") return (
            <span className="inline-flex items-center gap-1">
                <ChartLine className="h-3 w-3" />
                <span>Line</span>
            </span>
        );
        if (chartType === "heatmap") return (
            <span className="inline-flex items-center gap-1">
                <Grid3X3 className="h-3 w-3" />
                <span>Heatmap</span>
            </span>
        );
        return (
            <span className="inline-flex items-center gap-1 opacity-60">
                <Grid3X3 className="h-3 w-3" />
                <span>unknown</span>
            </span>
        );
    };

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <div className="h-12 px-3 py-2 border-b flex items-center">
                <span className="text-sm font-medium">Charts</span>
            </div>
            <div className="p-2 space-y-2 overflow-auto">
                {isLoading && (
                    <div className="text-xs text-muted-foreground px-2 py-6 text-center">Loading charts…</div>
                )}
                {charts.length === 0 && !isLoading && (
                    <div className="text-xs text-muted-foreground px-2 py-6 text-center">No charts yet. Create one to get started.</div>
                )}
                {charts.map((chart) => {
                    const isSelected = chart.id === activeTab;
                    const createdAt = chart.createdAt ? new Date(chart.createdAt).toLocaleDateString() : "";
                    const canDelete = charts.length > 1;
                    return (
                        <Card
                            key={chart.id}
                            className={`p-3 cursor-pointer rounded transition-all ${isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                            onClick={() => handleChartClick(chart)}
                        >
                            <div className="flex items-start gap-2">
                                <div className="mt-1">
                                    {renderToolIcon(chart.toolType)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-sm font-medium capitalize">
                                            {formatToolType(chart.toolType)}
                                        </span>
                                        {createdAt && (
                                            <span className="text-xs text-muted-foreground">{createdAt}</span>
                                        )}
                                    </div>
                                    <div className="text-xs text-muted-foreground break-words flex items-center gap-2">
                                        <span>
                                            {chart.annotationCount} {chart.annotationCount === 1 ? "annotation" : "annotations"}
                                        </span>
                                        <span className="opacity-60">•</span>
                                        {renderChartTypeMini(chart.chartType)}
                                    </div>
                                </div>
                                <button
                                    className={`p-1 rounded hover:bg-muted ${!canDelete ? "opacity-40 cursor-not-allowed" : ""}`}
                                    onClick={(e) => handleDelete(e, chart.id)}
                                    disabled={!canDelete || isDeleting}
                                    aria-label="Delete chart"
                                    title={!canDelete ? "At least one chart is required" : "Delete chart"}
                                >
                                    <Trash2 className="h-3 w-3" />
                                </button>
                            </div>
                        </Card>
                    );
                })}
                <div className="flex flex-row gap-2">
                <button 
                    className="w-full h-16 flex items-center text-xs border rounded border-dashed bg-muted/50 justify-center"
                    onClick={() => handleCreate("patch")}
                    disabled={isCreatingPatch}
                >
                    <span>+ Patch</span>
                </button>
                <button 
                    className="w-full h-16 flex items-center text-xs border rounded border-dashed bg-muted/50 justify-center"
                    onClick={() => handleCreate("lens")}
                    disabled={isCreatingLens}
                >
                    <span>+ Lens</span>
                </button>
                </div>
            </div>
        </div>
    );
}
