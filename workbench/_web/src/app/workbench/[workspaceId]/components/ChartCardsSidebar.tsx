"use client";

import { useQuery } from "@tanstack/react-query";
import { getChartsMetadata } from "@/lib/queries/chartQueries";
import { useParams, useRouter } from "next/navigation";
import {
    useCreateLensChartPair,
    useCreatePatchChartPair,
    useDeleteChart,
} from "@/lib/api/chartApi";
import {
    useCreateDocument,
    useDeleteDocument,
    useGetDocumentsForWorkspace,
} from "@/lib/api/documentApi";
import ChartCard from "./ChartCard";
import ReportCard from "./ReportCard";
import { ChartMetadata } from "@/types/charts";
import type { DocumentListItem } from "@/lib/queries/documentQueries";
import { Loader2, Plus, PanelLeftClose, PanelLeft, Search, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";

const SIDEBAR_COLLAPSED_KEY = "workbench_sidebar_collapsed";

export default function ChartCardsSidebar() {
    const { workspaceId } = useParams<{ workspaceId: string }>();
    const router = useRouter();

    const { data: charts, isLoading: isChartsLoading } = useQuery<ChartMetadata[]>({
        queryKey: ["chartsForSidebar", workspaceId],
        queryFn: () => getChartsMetadata(workspaceId as string),
    });

    const { data: reports, isLoading: isReportsLoading } = useGetDocumentsForWorkspace(
        workspaceId as string,
    );

    const { mutate: createLensPair, isPending: isCreatingLens } = useCreateLensChartPair();
    const { mutate: createPatchPair, isPending: isCreatingPatch } = useCreatePatchChartPair();
    const { mutate: deleteChart } = useDeleteChart();
    const { mutate: createDocument, isPending: isCreatingDocument } = useCreateDocument();
    const { mutate: deleteDocument } = useDeleteDocument();

    const listRef = useRef<HTMLDivElement | null>(null);
    const cardsRef = useRef<HTMLDivElement | null>(null);
    const buttonsMeasureRef = useRef<HTMLDivElement | null>(null);
    const [canInlineButtons, setCanInlineButtons] = useState(true);

    // Collapse state - persisted in localStorage
    const [isCollapsed, setIsCollapsed] = useState(() => {
        if (typeof window !== "undefined") {
            return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
        }
        return false;
    });

    const toggleCollapse = () => {
        const newState = !isCollapsed;
        setIsCollapsed(newState);
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(newState));
    };

    useEffect(() => {
        const listEl = listRef.current;
        const cardsEl = cardsRef.current;
        if (!listEl || !cardsEl) return;

        const recompute = () => {
            const scrollAreaHeight = listEl.clientHeight;
            const cardsHeight = cardsEl.scrollHeight;
            const buttonsHeight = buttonsMeasureRef.current?.offsetHeight ?? 0;
            const fitsInline = cardsHeight + buttonsHeight <= scrollAreaHeight;
            setCanInlineButtons(fitsInline);
        };

        // Initial compute
        recompute();

        const listObserver = new ResizeObserver(recompute);
        const cardsObserver = new ResizeObserver(recompute);
        listObserver.observe(listEl);
        cardsObserver.observe(cardsEl);

        const onResize = () => recompute();
        window.addEventListener("resize", onResize);

        return () => {
            listObserver.disconnect();
            cardsObserver.disconnect();
            window.removeEventListener("resize", onResize);
        };
    }, [charts, reports]);

    const navigateToChart = (chartId: string) => {
        router.push(`/workbench/${workspaceId}/${chartId}`);
    };

    const navigateToOverview = (documentId: string) => {
        router.push(`/workbench/${workspaceId}/overview/${documentId}`);
    };

    const handleCreate = (toolType: "lens" | "patch") => {
        const mutation = toolType === "lens" ? createLensPair : createPatchPair;
        mutation(
            {
                workspaceId: workspaceId as string,
            },
            {
                onSuccess: ({ chart }) => navigateToChart(chart.id),
            },
        );
    };

    const handleDelete = (e: React.MouseEvent, chartId: string) => {
        e.stopPropagation();
        if (!charts || charts.length <= 1) return;
        // Choose next chart to focus
        const remaining = charts.filter((c) => c.id !== chartId);
        const nextId = remaining[0]?.id;
        deleteChart(chartId, {
            onSuccess: () => {
                if (nextId) navigateToChart(nextId);
            },
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
        deleteDocument(
            { workspaceId: workspaceId as string, documentId: reportId },
            {
                onSuccess: () => {
                    // If the current route is the deleted report, navigate to first chart if any
                    const firstChartId = charts && charts.length > 0 ? charts[0].id : null;
                    if (firstChartId) {
                        navigateToChart(firstChartId);
                    }
                },
            },
        );
    };

    const ActionButtons = () => (
        <div className="flex flex-row w-full gap-3 text-sm">
            <Button
                variant="outline"
                onClick={() => handleCreate("lens")}
                disabled={isCreatingPatch}
                className="flex-1"
            >
                {isCreatingLens ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    <Plus className="w-4 h-4" />
                )}
                <span>Lens</span>
            </Button>
            <Button
                variant="outline"
                onClick={handleOverviewClick}
                disabled={isCreatingLens}
                className="flex-1"
            >
                {isCreatingDocument ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    <Plus className="w-4 h-4" />
                )}
                <span>Report</span>
            </Button>
        </div>
    );

    // Collapsed view - just a thin strip with expand button at top
    if (isCollapsed) {
        return (
            <div className="flex h-full flex-col w-10 p-2 pt-0 items-center transition-all duration-300 ease-in-out">
                {/* Expand button - top */}
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleCollapse}
                    className="mt-2 h-7 w-7 hover:bg-muted"
                    title="Expand sidebar"
                >
                    <PanelLeft className="h-4 w-4" />
                </Button>

                {/* Action buttons - below expand */}
                <div className="flex flex-col items-center gap-2 mt-3">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCreate("lens")}
                        disabled={isCreatingLens || isCreatingPatch}
                        className="h-7 w-7 hover:bg-muted opacity-60 hover:opacity-100 transition-opacity"
                        title="New Lens chart"
                    >
                        {isCreatingLens ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Search className="h-4 w-4" />
                        )}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleOverviewClick}
                        disabled={isCreatingDocument || isCreatingLens}
                        className="h-7 w-7 hover:bg-muted opacity-60 hover:opacity-100 transition-opacity"
                        title="New Report"
                    >
                        {isCreatingDocument ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <FileText className="h-4 w-4" />
                        )}
                    </Button>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center gap-2 py-4">
                    <span className="text-xs text-muted-foreground [writing-mode:vertical-lr] rotate-180">
                        {charts?.length || 0} charts
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className="relative flex h-full flex-col w-[20vw] p-3 pt-3 transition-all duration-300 ease-in-out">
            {/* Collapse button - centered vertically on the right edge */}
            <Button
                variant="ghost"
                size="icon"
                onClick={toggleCollapse}
                className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 h-6 w-6 rounded-full bg-background/60 hover:bg-background/90 border border-border/50 opacity-40 hover:opacity-100 transition-opacity z-10"
                title="Collapse sidebar"
            >
                <PanelLeftClose className="h-3 w-3" />
            </Button>
            <div ref={listRef} className="flex-1 scrollbar-hide overflow-auto">
                <div ref={cardsRef} className="space-y-3">
                    {(isChartsLoading || isReportsLoading) && (
                        <>
                            <div className="h-24 bg-card animate-pulse rounded" />
                            <div className="h-24 bg-card animate-pulse rounded" />
                            <div className="h-24 bg-card animate-pulse rounded" />
                        </>
                    )}
                    {(!charts || charts.length === 0) &&
                        (!reports || reports.length === 0) &&
                        !isChartsLoading &&
                        !isReportsLoading && (
                            <div className="text-xs text-muted-foreground px-3 py-6 text-center">
                                No charts or reports yet. Create one to get started.
                            </div>
                        )}
                    {charts &&
                        reports &&
                        [
                            ...charts.map((c) => ({ type: "chart" as const, item: c })),
                            ...reports.map((r) => ({ type: "report" as const, item: r })),
                        ]
                            .sort((a, b) => {
                                const aTime =
                                    a.type === "chart"
                                        ? new Date(a.item.createdAt).getTime()
                                        : new Date(a.item.createdAt).getTime();
                                const bTime =
                                    b.type === "chart"
                                        ? new Date(b.item.createdAt).getTime()
                                        : new Date(b.item.createdAt).getTime();
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
                            })}
                </div>
                {canInlineButtons && (
                    <div className="pt-3">
                        <ActionButtons />
                    </div>
                )}
            </div>
            {!canInlineButtons && (
                <div className="pt-3 shrink-0">
                    <ActionButtons />
                </div>
            )}
            {/* Hidden measure for buttons height to avoid layout feedback */}
            <div className="absolute opacity-0 -z-10 pointer-events-none" ref={buttonsMeasureRef}>
                <ActionButtons />
            </div>
        </div>
    );
}
