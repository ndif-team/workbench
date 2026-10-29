"use client";

import { useQuery } from "@tanstack/react-query";
import { getChartsMetadata } from "@/lib/queries/chartQueries";
import { useParams, useRouter } from "next/navigation";
import { useWorkspaceScope } from "@/components/providers/WorkspaceScopeProvider";
import {
    useCreateLogitLensChartPair,
    useCreateJLensChartPair,
    useCreatePatchLensChartPair,
    useCreateActivationPatchingChartPair,
    useDeleteChart,
} from "@/lib/api/chartApi";
import {
    useCreateDocument,
    useDeleteDocument,
    useGetDocumentsForWorkspace,
} from "@/lib/api/documentApi";
import { useReorderWorkspaceItems } from "@/lib/api/workspaceApi";
import { useWorkspaceWorkshop } from "@/lib/api/workshopApi";
import { queryKeys } from "@/lib/queryKeys";
import { useCapture } from "@/lib/analytics";
import { chartPath, openWorkspacePath, reportPath } from "@/lib/chartRoutes";
import type { WorkshopTool } from "@/db/schema";
import ChartCard from "./ChartCard";
import ReportCard from "./ReportCard";
import { DeployCard } from "./DeployCard";
import { SortableEntry, entryKey, type SidebarEntry } from "./SortableEntry";
import { useDeployStateOf } from "./useDeployStateOf";
import type { ChartMetadata, ToolType } from "@/types/charts";
import { Loader2, Plus, FileText, Layers, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PatchLensIcon } from "@/components/PatchLensIcon";
import { JLensIcon } from "@/components/JLensIcon";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    DndContext,
    PointerSensor,
    KeyboardSensor,
    useSensor,
    useSensors,
    closestCenter,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    arrayMove,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";

/**
 * The workspace-scoped sidebar the shell shows on a workshop workspace's
 * charts: that workspace's charts and reports, plus buttons that create a
 * chart (of the workshop's allowed tools) or a report in it. Reads the
 * workspace from the workspace scope. `collapsed` renders the rail strip; the
 * shell owns the collapse control.
 */
export default function ChartCardsSidebar({ collapsed }: { collapsed: boolean }) {
    const { chartId } = useParams<{ chartId?: string }>();
    const workspaceId = useWorkspaceScope()?.workspaceId ?? "";
    const router = useRouter();
    const capture = useCapture();

    const { data: charts, isLoading: isChartsLoading } = useQuery<ChartMetadata[]>({
        queryKey: queryKeys.charts.sidebar(workspaceId),
        queryFn: () => getChartsMetadata(workspaceId),
        enabled: !!workspaceId,
    });

    const { data: reports, isLoading: isReportsLoading } = useGetDocumentsForWorkspace(workspaceId);

    // Workshop workspaces only offer the tools their workshop allows.
    const { data: workshop } = useWorkspaceWorkshop(workspaceId);

    const { mutate: createLogitLensPair, isPending: isCreatingLogitLens } =
        useCreateLogitLensChartPair();
    const { mutate: createJLensPair, isPending: isCreatingJLens } = useCreateJLensChartPair();
    const { mutate: createPatchLensPair, isPending: isCreatingPatchLens } =
        useCreatePatchLensChartPair();
    const { mutate: createActivationPatchingPair, isPending: isCreatingActivationPatching } =
        useCreateActivationPatchingChartPair();
    const { mutate: deleteChart } = useDeleteChart();
    const { mutate: createDocument, isPending: isCreatingDocument } = useCreateDocument();
    const { mutate: deleteDocument } = useDeleteDocument();
    const { mutate: reorderItems } = useReorderWorkspaceItems();

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const entries = useMemo<SidebarEntry[]>(() => {
        if (!charts || !reports) return [];
        return [
            ...charts.map((c) => ({ type: "chart" as const, item: c })),
            ...reports.map((r) => ({ type: "report" as const, item: r })),
        ].sort((a, b) => {
            const posDiff = a.item.position - b.item.position;
            if (posDiff !== 0) return posDiff;
            return new Date(a.item.createdAt).getTime() - new Date(b.item.createdAt).getTime();
        });
    }, [charts, reports]);

    // A chart whose saved model is still warming up shows *its own* row as a
    // deploying card, then swaps to the normal chart card once it is ready.
    const deployStateOf = useDeployStateOf();

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;
            const oldIndex = entries.findIndex((e) => entryKey(e) === active.id);
            const newIndex = entries.findIndex((e) => entryKey(e) === over.id);
            if (oldIndex === -1 || newIndex === -1) return;
            const newEntries = arrayMove(entries, oldIndex, newIndex);
            reorderItems({
                workspaceId: workspaceId,
                items: newEntries.map((e) => ({ kind: e.type, id: e.item.id })),
            });
        },
        [entries, reorderItems, workspaceId],
    );

    const listRef = useRef<HTMLDivElement | null>(null);
    const cardsRef = useRef<HTMLDivElement | null>(null);
    const buttonsMeasureRef = useRef<HTMLDivElement | null>(null);
    const [canInlineButtons, setCanInlineButtons] = useState(true);

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

    const navigateToChart = (chartId: string, toolType?: string) => {
        router.push(chartPath(chartId, toolType, workspaceId));
    };

    const navigateToOverview = (documentId: string) => {
        router.push(reportPath(documentId));
    };

    const handleCreate = (toolType: ToolType) => {
        // Guard against stale UI / programmatic calls; the buttons below are
        // already filtered. createChartConfigPair re-checks server-side.
        if (workshop && !workshop.allowedTools.includes(toolType as WorkshopTool)) return;
        capture("chart_created", { tool: toolType });
        if (toolType === "logit-lens") {
            createLogitLensPair(
                { workspaceId: workspaceId },
                {
                    onSuccess: ({ chart }) => navigateToChart(chart.id, "logit-lens"),
                },
            );
            return;
        }
        if (toolType === "jlens") {
            createJLensPair(
                { workspaceId: workspaceId },
                {
                    onSuccess: ({ chart }) => navigateToChart(chart.id, "jlens"),
                },
            );
            return;
        }
        if (toolType === "patch-lens") {
            createPatchLensPair(
                { workspaceId: workspaceId },
                {
                    onSuccess: ({ chart }) => navigateToChart(chart.id, "patch-lens"),
                },
            );
            return;
        }
        createActivationPatchingPair(
            { workspaceId: workspaceId },
            {
                onSuccess: ({ chart }) => navigateToChart(chart.id, "activation-patching"),
            },
        );
    };

    const handleDelete = (e: React.MouseEvent, chartId: string) => {
        e.stopPropagation();
        if (!charts || charts.length <= 1) return;
        const remaining = charts.filter((c) => c.id !== chartId);
        const nextChart = remaining[0];
        deleteChart(
            { chartId, workspaceId: workspaceId },
            {
                onSuccess: () => {
                    if (nextChart)
                        navigateToChart(
                            nextChart.id,
                            nextChart.toolType ?? nextChart.chartType ?? undefined,
                        );
                },
            },
        );
    };

    // Deletes a deploy placeholder (a chart whose model never deployed / failed
    // to deploy). Unlike handleDelete it isn't blocked when it's the only chart
    // — a lone failed placeholder is exactly what you'd want to clear — and only
    // navigates away if you're currently viewing the one being removed.
    const handleDeletePlaceholder = (e: React.MouseEvent, deletedId: string) => {
        e.stopPropagation();
        const remaining = (charts ?? []).filter((c) => c.id !== deletedId);
        deleteChart(
            { chartId: deletedId, workspaceId: workspaceId },
            {
                onSuccess: () => {
                    if (chartId !== deletedId) return;
                    const nextChart = remaining[0];
                    if (nextChart)
                        navigateToChart(
                            nextChart.id,
                            nextChart.toolType ?? nextChart.chartType ?? undefined,
                        );
                    else router.push(openWorkspacePath(workspaceId));
                },
            },
        );
    };

    const handleOverviewClick = () => {
        // Option A: prevent multiple empty reports
        const empty = (reports || []).find((r) => r.derivedTitle === "");
        if (empty) {
            navigateToOverview(empty.id);
            return;
        }
        createDocument(workspaceId, {
            onSuccess: (created) => {
                if (created?.id) navigateToOverview(created.id);
            },
        });
    };

    const handleDeleteReport = (e: React.MouseEvent, reportId: string) => {
        e.stopPropagation();
        deleteDocument(
            { workspaceId: workspaceId, documentId: reportId },
            {
                onSuccess: () => {
                    // If the current route is the deleted report, navigate to first chart if any
                    const firstChart = charts && charts.length > 0 ? charts[0] : null;
                    if (firstChart) {
                        navigateToChart(
                            firstChart.id,
                            firstChart.toolType ?? firstChart.chartType ?? undefined,
                        );
                    }
                },
            },
        );
    };

    const isCreatingAny =
        isCreatingLogitLens ||
        isCreatingJLens ||
        isCreatingPatchLens ||
        isCreatingActivationPatching ||
        isCreatingDocument;

    // One registry for both sidebar variants (expanded list + collapsed strip),
    // filtered down to the workshop's allowed tools for workshop workspaces.
    const toolButtons = [
        {
            tool: "logit-lens" as const,
            label: "Logit Lens",
            title: "New Logit Lens visualization",
            Icon: Layers,
            isCreating: isCreatingLogitLens,
        },
        {
            tool: "jlens" as const,
            label: "J-Lens",
            title: "New J-Lens visualization",
            Icon: JLensIcon,
            isCreating: isCreatingJLens,
        },
        {
            tool: "activation-patching" as const,
            label: "Activation Patching",
            title: "New Activation Patching",
            Icon: GitBranch,
            isCreating: isCreatingActivationPatching,
        },
        {
            tool: "patch-lens" as const,
            label: "Patch Lens",
            title: "New Patch Lens",
            Icon: PatchLensIcon,
            isCreating: isCreatingPatchLens,
        },
    ].filter(({ tool }) => !workshop || workshop.allowedTools.includes(tool as WorkshopTool));

    const actionButtons = (
        <div className="flex flex-col w-full gap-2 text-sm">
            {toolButtons.map(({ tool, label, title, Icon, isCreating }) => (
                <Button
                    key={tool}
                    variant="outline"
                    onClick={() => handleCreate(tool)}
                    disabled={isCreatingAny}
                    className="w-full"
                    title={title}
                >
                    {isCreating ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Icon className="w-4 h-4" />
                    )}
                    <span>{label}</span>
                </Button>
            ))}
            <Button
                variant="outline"
                onClick={handleOverviewClick}
                disabled={isCreatingAny}
                className="w-full"
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

    // Collapsed: a strip of create buttons under the shell's expand control.
    if (collapsed) {
        return (
            <div className="flex h-full flex-col items-center p-2 pt-0">
                <div className="flex flex-col items-center gap-2">
                    {toolButtons.map(({ tool, title, Icon, isCreating }) => (
                        <Button
                            key={tool}
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCreate(tool)}
                            disabled={isCreatingAny}
                            className="h-7 w-7 hover:bg-muted opacity-60 hover:opacity-100 transition-opacity"
                            title={title}
                        >
                            {isCreating ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Icon className="h-4 w-4" />
                            )}
                        </Button>
                    ))}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleOverviewClick}
                        disabled={isCreatingAny}
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
                        {charts?.length ?? 0} {charts?.length === 1 ? "chart" : "charts"}
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className="relative flex h-full w-full min-h-0 flex-col px-2 pb-2 pt-0">
            <div ref={listRef} className="flex-1 scrollbar-hide overflow-auto">
                <div ref={cardsRef} className="flex flex-col gap-2">
                    {(isChartsLoading || isReportsLoading) && (
                        <>
                            <div className="h-16 bg-secondary/80 dark:bg-secondary/50 animate-pulse rounded border border-border" />
                            <div className="h-16 bg-secondary/80 dark:bg-secondary/50 animate-pulse rounded border border-border" />
                            <div className="h-16 bg-secondary/80 dark:bg-secondary/50 animate-pulse rounded border border-border" />
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
                    {charts && reports && entries.length > 0 && (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={entries.map(entryKey)}
                                strategy={verticalListSortingStrategy}
                            >
                                {entries.map((entry) => {
                                    const key = entryKey(entry);
                                    if (entry.type === "chart") {
                                        const canDelete = (charts?.length || 0) > 1;
                                        const chart = entry.item;
                                        const deployState = deployStateOf({
                                            model: chart.model,
                                            hasData: chart.hasData ?? false,
                                        });
                                        return (
                                            <SortableEntry key={key} id={key}>
                                                {deployState ? (
                                                    <DeployCard
                                                        model={chart.model ?? ""}
                                                        state={deployState}
                                                        selected={chartId === chart.id}
                                                        onClick={() =>
                                                            navigateToChart(
                                                                chart.id,
                                                                chart.toolType ?? undefined,
                                                            )
                                                        }
                                                        onDelete={
                                                            deployState === "deploying"
                                                                ? undefined
                                                                : (e) =>
                                                                      handleDeletePlaceholder(
                                                                          e,
                                                                          chart.id,
                                                                      )
                                                        }
                                                    />
                                                ) : (
                                                    <ChartCard
                                                        metadata={chart}
                                                        handleDelete={handleDelete}
                                                        canDelete={canDelete}
                                                    />
                                                )}
                                            </SortableEntry>
                                        );
                                    }
                                    const report = entry.item;
                                    return (
                                        <SortableEntry key={key} id={key}>
                                            <ReportCard
                                                report={report}
                                                onClick={() => navigateToOverview(report.id)}
                                                onDelete={(e) => handleDeleteReport(e, report.id)}
                                            />
                                        </SortableEntry>
                                    );
                                })}
                            </SortableContext>
                        </DndContext>
                    )}
                </div>
                {canInlineButtons && <div className="pt-3">{actionButtons}</div>}
            </div>
            {!canInlineButtons && <div className="pt-3 shrink-0">{actionButtons}</div>}
            {/* Hidden measure for buttons height to avoid layout feedback */}
            <div className="absolute opacity-0 -z-10 pointer-events-none" ref={buttonsMeasureRef}>
                {actionButtons}
            </div>
        </div>
    );
}
