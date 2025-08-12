"use client";

import { useQuery } from "@tanstack/react-query";
import { getChartsForSidebar, type ToolTypedChart } from "@/lib/queries/chartQueries";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Grid3X3, ChartLine, Search, ReplaceAll, Trash2, FileText } from "lucide-react";
import { useWorkspace } from "@/stores/useWorkspace";
import { useCreateLensChartPair, useCreatePatchChartPair, useDeleteChart } from "@/lib/api/chartApi";
import { useCreateDocument, useGetDocumentsForWorkspace } from "@/lib/api/documentApi";
import { Document } from "@/db/schema";
import Image from "next/image";

export default function ChartCardsSidebar() {
    const params = useParams<{ workspaceId: string, chartId?: string, overviewId?: string }>();
    const workspaceId = params.workspaceId;
    const currentId = params.chartId || params.overviewId;
    const router = useRouter();
    const { selectedModel } = useWorkspace();

    const { data: charts, isLoading: chartsLoading } = useQuery<ToolTypedChart[]>({
        queryKey: ["chartsForSidebar", workspaceId],
        queryFn: () => getChartsForSidebar(workspaceId as string),
    });

    const { data: documents, isLoading: docsLoading } = useGetDocumentsForWorkspace(workspaceId as string);
    
    const isLoading = chartsLoading || docsLoading;

    const { mutate: createLensPair, isPending: isCreatingLens } = useCreateLensChartPair();
    const { mutate: createPatchPair, isPending: isCreatingPatch } = useCreatePatchChartPair();
    const { mutate: deleteChart, isPending: isDeleting } = useDeleteChart();
    const { mutate: createDocument, isPending: isCreatingOverview } = useCreateDocument();

    const navigateToChart = (chartId: string) => {
        router.push(`/workbench/${workspaceId}/${chartId}`);
    };

    const navigateToOverview = (documentId: string) => {
        router.push(`/workbench/${workspaceId}/overview/${documentId}`);
    };

    const handleChartClick = (chart: ToolTypedChart) => {
        navigateToChart(chart.id);
    };

    const handleCreate = (toolType: "lens" | "patch" | "overview") => {
        if (toolType === "overview") {
            createDocument(workspaceId as string, {
                onSuccess: (document) => navigateToOverview(document.id)
            });
        } else if (toolType === "lens") {
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

    if (!charts && !documents) return null;

    // Combine charts and documents, sorted by creation date
    type SidebarItem = (ToolTypedChart & { itemType: "chart" }) | (Document & { itemType: "document" });
    
    const allItems: SidebarItem[] = [
        ...(charts || []).map(chart => ({ ...chart, itemType: "chart" as const })),
        ...(documents || []).map(doc => ({ ...doc, itemType: "document" as const }))
    ].sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA; // Most recent first
    });

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

    const Thumbnail = ({ url }: { url: string | null | undefined }) => {
        const width = 48;
        const height = 32;
        if (!url) {
            return (
                <div className="w-12 h-8 rounded bg-muted flex items-center justify-center text-[10px] text-muted-foreground">img</div>
            );
        }
        return (
            <div className="relative w-12 h-8 overflow-hidden rounded border">
                <Image
                    src={url}
                    alt="chart thumbnail"
                    fill
                    sizes="48px"
                    style={{ objectFit: "cover" }}
                    loading="lazy"
                    placeholder="empty"
                />
            </div>
        );
    };

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <div className="h-12 px-3 py-2 border-b flex items-center">
                <span className="text-sm font-medium">Charts</span>
            </div>
            <div className="p-2 space-y-2 overflow-auto">
                {isLoading && (
                    <div className="text-xs text-muted-foreground px-2 py-6 text-center">Loading...</div>
                )}
                {allItems.length === 0 && !isLoading && (
                    <div className="text-xs text-muted-foreground px-2 py-6 text-center">No content yet. Create a chart or overview to get started.</div>
                )}
                {allItems.map((item) => {
                    const isSelected = item.id === currentId;
                    const createdAt = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "";
                    
                    if (item.itemType === "document") {
                        return (
                            <Card
                                key={item.id}
                                className={`p-3 cursor-pointer rounded transition-all ${isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                                onClick={() => navigateToOverview(item.id)}
                            >
                                <div className="flex items-start gap-2">
                                    <div className="mt-1">
                                        <FileText className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-sm font-medium">
                                                Overview
                                            </span>
                                            {createdAt && (
                                                <span className="text-xs text-muted-foreground">{createdAt}</span>
                                            )}
                                        </div>
                                        <div className="text-xs text-muted-foreground break-words">
                                            Document
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        );
                    }
                    
                    // It's a chart
                    const chart = item as ToolTypedChart;
                    const canDelete = (charts?.length || 0) > 1;
                    return (
                        <Card
                            key={chart.id}
                            className={`p-3 cursor-pointer rounded transition-all ${isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                            onClick={() => handleChartClick(chart)}
                        >
                            <div className="flex items-start gap-2">
                                <Thumbnail url={chart.thumbnailUrl} />
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
                    <button
                        className="w-full h-16 flex items-center text-xs border rounded border-dashed bg-muted/50 justify-center"
                        onClick={() => handleCreate("overview")}
                        disabled={isCreatingOverview}
                    >
                        <span>+ Overview</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
