"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { SerializedEditorState } from "lexical";
import { ChevronRight } from "lucide-react";

import { ModelControl } from "@/components/ModelControl";
import { useWorkspaceScope } from "@/components/providers/WorkspaceScopeProvider";
import { useGetDocument } from "@/lib/api/documentApi";
import { useUpdateChartName } from "@/lib/api/chartApi";
import { useWorkspaceLibrary } from "@/lib/api/workspaceApi";
import { getChartById } from "@/lib/queries/chartQueries";
import { getWorkspaceById } from "@/lib/queries/workspaceQueries";
import { queryKeys } from "@/lib/queryKeys";
import { workspacePath } from "@/lib/chartRoutes";
import { deriveReportTitle } from "@/lib/reportTitle";
import { cn } from "@/lib/utils";
import { PageHeader } from "../shell/PageHeader";
import { ItemActionsMenu } from "./ItemActionsMenu";
import { chartName } from "./itemLabel";
import { InlineNameInput } from "./InlineNameInput";

type ItemRef = { kind: "chart"; id: string } | { kind: "report"; id: string };

/**
 * A chart or report page inside the shell: the page header (model picker,
 * breadcrumb, the item's actions) above the page itself. Rendered by the
 * item route's layout, inside its workspace scope.
 */
export function ItemPage({ item, children }: { item: ItemRef; children: ReactNode }) {
    return (
        <div className="flex size-full min-h-0 flex-col">
            <ItemPageHeader item={item} />
            <div className="min-h-0 flex-1">{children}</div>
        </div>
    );
}

/**
 * The item's header. The breadcrumb leads with the item's workspace (nothing
 * for the default workspace); a chart's name is renamed in place by clicking
 * it or from the actions menu. Workshop items get no actions menu: they can't
 * be moved, and the workshop sidebar already covers the rest.
 */
function ItemPageHeader({ item }: { item: ItemRef }) {
    const scope = useWorkspaceScope();
    const isWorkshop = !!scope?.workshopId;
    const folderId = scope && !scope.isDefault ? scope.workspaceId : null;
    const [renaming, setRenaming] = useState(false);

    const { data: library } = useWorkspaceLibrary({ enabled: !!scope && !isWorkshop });
    const { data: folder } = useQuery({
        queryKey: queryKeys.workspaces.workspace(folderId ?? ""),
        queryFn: () => getWorkspaceById(folderId as string),
        enabled: !!folderId,
    });

    const libraryItem =
        library &&
        [...library.defaultItems, ...library.workspaces.flatMap((w) => w.items)].find(
            (i) => i.kind === item.kind && i.id === item.id,
        );

    return (
        <PageHeader
            start={<ModelControl />}
            center={
                <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm">
                    {folderId && (
                        <>
                            <Link
                                href={workspacePath(folderId)}
                                title={folder?.name}
                                className="hidden min-w-0 max-w-[12rem] truncate rounded-sm px-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:block"
                            >
                                {folder?.name ?? "Workspace"}
                            </Link>
                            <ChevronRight
                                aria-hidden
                                className="hidden size-3.5 shrink-0 text-muted-foreground md:block"
                            />
                        </>
                    )}
                    {item.kind === "chart" ? (
                        <ChartTitle
                            chartId={item.id}
                            editing={renaming}
                            onEditingChange={setRenaming}
                        />
                    ) : (
                        <ReportTitle reportId={item.id} />
                    )}
                </nav>
            }
            end={
                libraryItem && !isWorkshop ? (
                    <ItemActionsMenu
                        item={libraryItem}
                        workspaces={library.workspaces}
                        folder={folderId ? { id: folderId, name: folder?.name ?? "" } : null}
                        active
                        onRename={() => setRenaming(true)}
                        variant="header"
                        align="end"
                    />
                ) : null
            }
        />
    );
}

const titleClass = "min-w-0 truncate rounded-sm px-1 text-sm font-medium";

/** The chart's name; click it (or pick Rename) to edit it in place. */
function ChartTitle({
    chartId,
    editing,
    onEditingChange,
}: {
    chartId: string;
    editing: boolean;
    onEditingChange: (editing: boolean) => void;
}) {
    const { data: chart } = useQuery({
        queryKey: queryKeys.charts.chart(chartId),
        queryFn: () => getChartById(chartId),
    });
    const { mutate: renameChart } = useUpdateChartName();
    const savedName = chartName(chart?.name);
    const [pendingName, setPendingName] = useState<string | null>(null);
    const name = pendingName ?? savedName;

    useEffect(() => setPendingName(null), [savedName]);

    if (editing) {
        return (
            <InlineNameInput
                initialValue={name}
                ariaLabel="Chart name"
                placeholder="Untitled chart"
                className="h-7 w-64 max-w-full px-2 font-medium"
                onDone={(next) => {
                    onEditingChange(false);
                    if (next === null || next === name) return;
                    setPendingName(next);
                    renameChart({ chartId, name: next || "Untitled Chart" });
                }}
            />
        );
    }

    return (
        <button
            type="button"
            onClick={() => onEditingChange(true)}
            title={name ? `${name} (click to rename)` : "Click to name this chart"}
            className={cn(
                titleClass,
                "cursor-text transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                !name && "text-muted-foreground",
            )}
        >
            {chart ? name || "Untitled chart" : " "}
        </button>
    );
}

/** A report's title, derived from its first line as it is saved. */
function ReportTitle({ reportId }: { reportId: string }) {
    const { data: report } = useGetDocument(reportId);
    const title = report ? deriveReportTitle(report.content as SerializedEditorState) : "";
    return (
        <h1
            title={title || undefined}
            className={cn(titleClass, !title && "text-muted-foreground")}
        >
            {report ? title || "Untitled report" : " "}
        </h1>
    );
}
