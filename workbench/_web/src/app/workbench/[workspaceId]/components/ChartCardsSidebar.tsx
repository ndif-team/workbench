"use client";

import { useQuery } from "@tanstack/react-query";
import { getChartsMetadata } from "@/lib/queries/chartQueries";
import { useParams, useRouter } from "next/navigation";
import {
    useCreateLens2ChartPair,
    useCreatePatchChartPair,
    useCreateActivationPatchingChartPair,
    useDeleteChart,
} from "@/lib/api/chartApi";
import {
    useCreateDocument,
    useDeleteDocument,
    useGetDocumentsForWorkspace,
} from "@/lib/api/documentApi";
import { useReorderWorkspaceItems } from "@/lib/api/workspaceApi";
import { queryKeys } from "@/lib/queryKeys";
import ChartCard from "./ChartCard";
import ReportCard from "./ReportCard";
import { DeployCard, type DeployCardState } from "./DeployCard";
import { SortableEntry, entryKey, type SidebarEntry } from "./SortableEntry";
import { useModelDeployment } from "@/stores/useModelDeployment";
import { useModelsQuery } from "@/lib/api/modelsApi";
import { isChartModelDeploying } from "@/hooks/useChartModelReady";
import { isModelDeploying } from "@/components/model-selector/status";
import { ChartMetadata } from "@/types/charts";
import type { DocumentListItem } from "@/lib/queries/documentQueries";
import {
    Loader2,
    Plus,
    PanelLeftClose,
    PanelLeft,
    FileText,
    Layers,
    GitBranch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

const SIDEBAR_COLLAPSED_KEY = "workbench_sidebar_collapsed";

export default function ChartCardsSidebar({ fillWidth = false }: { fillWidth?: boolean }) {
    const { workspaceId, chartId } = useParams<{ workspaceId: string; chartId?: string }>();
    const router = useRouter();

    const { data: charts, isLoading: isChartsLoading } = useQuery<ChartMetadata[]>({
        queryKey: queryKeys.charts.sidebar(workspaceId as string),
        queryFn: () => getChartsMetadata(workspaceId as string),
    });

    const { data: reports, isLoading: isReportsLoading } = useGetDocumentsForWorkspace(
        workspaceId as string,
    );

    const { mutate: createLens2Pair, isPending: isCreatingLens2 } = useCreateLens2ChartPair();
    const { mutate: createPatchPair, isPending: isCreatingPatch } = useCreatePatchChartPair();
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
    // deploying card (instead of a second, independent one), then swaps to the
    // normal chart card once the model is ready. Derived from the same source
    // as the chart page's deploying panel — the persisted model + the live
    // catalog heat + the deployment store — so the sidebar and the display area
    // never disagree (e.g. after a reload, when the store has been cleared).
    const deployments = useModelDeployment((s) => s.deployments);
    const { data: models } = useModelsQuery();
    const modelByName = useMemo(() => new Map((models ?? []).map((m) => [m.name, m])), [models]);
    const deployStateOf = useCallback(
        (chart: ChartMetadata): DeployCardState | null => {
            if (!chart.model) return null;
            const phase = deployments[chart.model]?.phase ?? "idle";
            const catalogModel = modelByName.get(chart.model);
            if (!isChartModelDeploying(catalogModel, phase, chart.hasData ?? false)) return null;
            if (phase === "error") return "failed";
            // In flight either via our own warmup or NDIF reporting it mid-load;
            // otherwise it's simply cold/not-deployed (matches the chart panel's
            // "Deploy" state after a reload clears the store).
            if (phase === "submitting" || phase === "deploying" || isModelDeploying(catalogModel)) {
                return "deploying";
            }
            return "cold";
        },
        [deployments, modelByName],
    );

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;
            const oldIndex = entries.findIndex((e) => entryKey(e) === active.id);
            const newIndex = entries.findIndex((e) => entryKey(e) === over.id);
            if (oldIndex === -1 || newIndex === -1) return;
            const newEntries = arrayMove(entries, oldIndex, newIndex);
            reorderItems({
                workspaceId: workspaceId as string,
                items: newEntries.map((e) => ({ kind: e.type, id: e.item.id })),
            });
        },
        [entries, reorderItems, workspaceId],
    );

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

    const navigateToChart = (chartId: string, toolType?: string) => {
        // Route based on tool type
        if (toolType === "lens2") {
            router.push(`/workbench/${workspaceId}/lens2/${chartId}`);
        } else if (toolType === "activation-patching") {
            router.push(`/workbench/${workspaceId}/activation-patching/${chartId}`);
        } else {
            router.push(`/workbench/${workspaceId}/${chartId}`);
        }
    };

    const navigateToOverview = (documentId: string) => {
        router.push(`/workbench/${workspaceId}/overview/${documentId}`);
    };

    const handleCreate = (toolType: "lens2" | "patch" | "activation-patching") => {
        if (toolType === "lens2") {
            createLens2Pair(
                { workspaceId: workspaceId as string },
                {
                    onSuccess: ({ chart }) => navigateToChart(chart.id, "lens2"),
                },
            );
            return;
        }
        if (toolType === "activation-patching") {
            createActivationPatchingPair(
                { workspaceId: workspaceId as string },
                {
                    onSuccess: ({ chart }) => navigateToChart(chart.id, "activation-patching"),
                },
            );
            return;
        }
        createPatchPair(
            {
                workspaceId: workspaceId as string,
            },
            {
                onSuccess: ({ chart }) => navigateToChart(chart.id, toolType),
            },
        );
    };

    const handleDelete = (e: React.MouseEvent, chartId: string) => {
        e.stopPropagation();
        if (!charts || charts.length <= 1) return;
        const remaining = charts.filter((c) => c.id !== chartId);
        const nextChart = remaining[0];
        deleteChart(
            { chartId, workspaceId: workspaceId as string },
            {
                onSuccess: () => {
                    if (nextChart) navigateToChart(nextChart.id, nextChart.toolType ?? undefined);
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
            { chartId: deletedId, workspaceId: workspaceId as string },
            {
                onSuccess: () => {
                    if (chartId !== deletedId) return;
                    const nextChart = remaining[0];
                    if (nextChart) navigateToChart(nextChart.id, nextChart.toolType ?? undefined);
                    else router.push(`/workbench/${workspaceId}`);
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
                    const firstChart = charts && charts.length > 0 ? charts[0] : null;
                    if (firstChart) {
                        navigateToChart(firstChart.id, firstChart.toolType ?? undefined);
                    }
                },
            },
        );
    };

    const isCreatingAny =
        isCreatingLens2 || isCreatingPatch || isCreatingActivationPatching || isCreatingDocument;

    const actionButtons = (
        <div className="flex flex-col w-full gap-2 text-sm">
            <Button
                variant="outline"
                onClick={() => handleCreate("lens2")}
                disabled={isCreatingAny}
                className="w-full"
                title="New Logit Lens visualization"
            >
                {isCreatingLens2 ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    <Layers className="w-4 h-4" />
                )}
                <span>Logit Lens</span>
            </Button>
            <Button
                variant="outline"
                onClick={() => handleCreate("activation-patching")}
                disabled={isCreatingAny}
                className="w-full"
                title="Activation Patching"
            >
                {isCreatingActivationPatching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    <GitBranch className="w-4 h-4" />
                )}
                <span>Activation Patching</span>
            </Button>
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

    // Collapsed view - just a thin strip with expand button at top
    if (isCollapsed && !fillWidth) {
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
                        onClick={() => handleCreate("lens2")}
                        disabled={isCreatingAny}
                        className="h-7 w-7 hover:bg-muted opacity-60 hover:opacity-100 transition-opacity"
                        title="New Logit Lens visualization"
                    >
                        {isCreatingLens2 ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Layers className="h-4 w-4" />
                        )}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCreate("activation-patching")}
                        disabled={isCreatingAny}
                        className="h-7 w-7 hover:bg-muted opacity-60 hover:opacity-100 transition-opacity"
                        title="New Activation Patching"
                    >
                        {isCreatingActivationPatching ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <GitBranch className="h-4 w-4" />
                        )}
                    </Button>
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
                        {charts?.length || 0} charts
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div
            className={`relative flex h-full flex-col ${fillWidth ? "w-full" : "w-[20vw]"} p-3 pt-3 transition-all duration-300 ease-in-out`}
        >
            {/* Collapse button - centered vertically on the right edge */}
            {!fillWidth && (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleCollapse}
                    className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 h-6 w-6 rounded-full bg-background/60 hover:bg-background/90 border border-border/50 opacity-40 hover:opacity-100 transition-opacity z-10"
                    title="Collapse sidebar"
                >
                    <PanelLeftClose className="h-3 w-3" />
                </Button>
            )}
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
                                        const deployState = deployStateOf(chart);
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
