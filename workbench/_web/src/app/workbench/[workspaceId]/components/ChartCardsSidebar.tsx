"use client";

import { useQuery } from "@tanstack/react-query";
import { getChartsMetadata } from "@/lib/queries/chartQueries";
import { useParams, useRouter } from "next/navigation";
import { useCreateLensChartPair, useCreatePatchChartPair, useDeleteChart } from "@/lib/api/chartApi";
import { useCreateDocument, useDeleteDocument, useGetDocumentsForWorkspace } from "@/lib/api/documentApi";
import ChartCard from "./ChartCard";
import ReportCard from "./ReportCard";
import { ChartMetadata } from "@/types/charts";
import type { DocumentListItem } from "@/lib/queries/documentQueries";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ChartCardsSidebar() {
    const { workspaceId } = useParams<{ workspaceId: string }>();
    const router = useRouter();

    const { data: charts, isLoading: isChartsLoading } = useQuery<ChartMetadata[]>({
        queryKey: ["chartsForSidebar", workspaceId],
        queryFn: () => getChartsMetadata(workspaceId as string),
    });

    const { data: reports, isLoading: isReportsLoading } = useGetDocumentsForWorkspace(workspaceId as string);

    const { mutate: createLensPair, isPending: isCreatingLens } = useCreateLensChartPair();
    const { mutate: createPatchPair, isPending: isCreatingPatch } = useCreatePatchChartPair();
    const { mutate: deleteChart } = useDeleteChart();
    const { mutate: createDocument, isPending: isCreatingOverview } = useCreateDocument();
    const { mutate: deleteDocument } = useDeleteDocument();

    const navigateToChart = (chartId: string) => {
        router.push(`/workbench/${workspaceId}/${chartId}`);
    };

    const navigateToOverview = (documentId: string) => {
        router.push(`/workbench/${workspaceId}/overview/${documentId}`);
    };

    const handleCreate = (toolType: "lens" | "patch") => {
        const mutation = toolType === "lens" ? createLensPair : createPatchPair;
        mutation({
            workspaceId: workspaceId as string,
        }, {
            onSuccess: ({ chart }) => navigateToChart(chart.id)
        });
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

    const handleOverviewClick = () => {
        // Option A: prevent multiple empty reports
        const empty = (reports || []).find((r) => r.derivedTitle === "");
        if (empty) {
            navigateToOverview(empty.id);
            return;
        }
        createDocument(workspaceId as string, {
            onSuccess: (created) => {
                if (created?.id) navigateToOverview(created.id);
            },
        });
    };

    const handleDeleteReport = (e: React.MouseEvent, reportId: string) => {
        e.stopPropagation();
        deleteDocument({ workspaceId: workspaceId as string, documentId: reportId }, {
            onSuccess: () => {
                // If the current route is the deleted report, navigate to first chart if any
                const firstChartId = charts && charts.length > 0 ? charts[0].id : null;
                if (firstChartId) {
                    navigateToChart(firstChartId);
                }
            },
        });
    };


    return (
        <div className="flex h-full flex-col overflow-hidden">
            <div className="px-3 space-y-3 overflow-auto">
                {(isChartsLoading || isReportsLoading) && (
                    <div className="text-xs text-muted-foreground px-3 py-6 text-center">Loading...</div>
                )}
                {(!charts || charts.length === 0) && (!reports || reports.length === 0) && !isChartsLoading && !isReportsLoading && (
                    <div className="text-xs text-muted-foreground px-3 py-6 text-center">No charts or reports yet. Create one to get started.</div>
                )}
                {(charts && reports) && (
                    [...charts.map((c) => ({ type: "chart" as const, item: c })), ...reports.map((r) => ({ type: "report" as const, item: r }))]
                        .sort((a, b) => {
                            const aTime = a.type === "chart" ? new Date(a.item.createdAt).getTime() : new Date(a.item.createdAt).getTime();
                            const bTime = b.type === "chart" ? new Date(b.item.createdAt).getTime() : new Date(b.item.createdAt).getTime();
                            return bTime - aTime; // newest first
                        })
                        .map((entry) => {
                            if (entry.type === "chart") {
                                const chart = entry.item as ChartMetadata;
                                const canDelete = (charts?.length || 0) > 1;
                                return (
                                    <ChartCard
                                        key={`chart-${chart.id}`}
                                        metadata={chart}
                                        handleDelete={handleDelete}
                                        canDelete={canDelete}
                                    />
                                );
                            }
                            const report = entry.item as DocumentListItem;
                            return (
                                <ReportCard
                                    key={`report-${report.id}`}
                                    report={report}
                                    onClick={() => navigateToOverview(report.id)}
                                    onDelete={(e) => handleDeleteReport(e, report.id)}
                                />
                            );
                        })
                )}
                <div className="flex flex-row h-8 gap-3 text-sm">
                    <Button
                        // className="size-full flex items-center gap-2 border rounded border-dashed bg-muted/50 justify-center"
                        variant="outline"
                        onClick={() => handleCreate("lens")}
                        disabled={isCreatingPatch}
                    >
                        <Plus className="w-4 h-4" />
                        <span> Lens</span>
                    </Button>
                    <Button
                        // className="size-full flex items-center gap-2 border rounded border-dashed bg-muted/50 justify-center"
                        variant="outline"
                        onClick={handleOverviewClick}
                        disabled={isCreatingLens}
                    >
                        <Plus className="w-4 h-4" />
                        <span>Report</span>
                    </Button>
                </div>
            </div>
        </div>
    );
}