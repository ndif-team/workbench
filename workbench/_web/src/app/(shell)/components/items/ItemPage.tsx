"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { SerializedEditorState } from "lexical";
import { ChevronRight } from "lucide-react";

import { ModelControl } from "@/components/ModelControl";
import { useWorkspaceScope } from "@/components/providers/WorkspaceScopeProvider";
import { useIsDark } from "@/hooks/useIsDark";
import { useGetDocument } from "@/lib/api/documentApi";
import { useUpdateChartName } from "@/lib/api/chartApi";
import { useChat, useUpdateChat } from "@/lib/api/chatApi";
import { useWorkspaceLibrary } from "@/lib/api/workspaceApi";
import { getChartById, getConfigForChart } from "@/lib/queries/chartQueries";
import { queryKeys } from "@/lib/queryKeys";
import { workspacePath } from "@/lib/chartRoutes";
import { chartFigure } from "@/lib/report/chartFigure";
import { deriveReportTitle } from "@/lib/reportTitle";
import { cn } from "@/lib/utils";
import { DEFAULT_CHART_NAME } from "@/types/charts";
import { DEFAULT_CHAT_NAME } from "@/types/chats";
import { ChartExportMenu } from "../ChartExportMenu";
import { useWorkshopParticipant } from "../shell/AppShell";
import { PageHeader } from "../shell/PageHeader";
import { ItemActionsMenu } from "./ItemActionsMenu";
import { chartName, itemLabel } from "./itemLabel";
import { InlineNameInput } from "./InlineNameInput";

type ItemRef =
    | { kind: "chart"; id: string }
    | { kind: "chat"; id: string }
    | { kind: "report"; id: string };

/**
 * A chart, chat or report page inside the shell: the page header (model picker,
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
 * The item's header. A chart's or chat's leads with the model picker (a
 * report has no model); a chart's ends with its Export menu once it has a
 * result. The breadcrumb leads with the item's workspace (nothing for the
 * default workspace); a chart's or chat's name is renamed in place by
 * clicking it or from the actions menu.
 * Workshop items get no actions menu: they can't be moved, and the workshop
 * sidebar already covers the rest.
 */
function ItemPageHeader({ item }: { item: ItemRef }) {
    const scope = useWorkspaceScope();
    const isWorkshop = !!scope?.workshopId;
    const folderId = scope && !scope.isDefault ? scope.workspaceId : null;
    const [renaming, setRenaming] = useState(false);

    const participant = useWorkshopParticipant();
    const { data: library } = useWorkspaceLibrary({
        enabled: !!scope && !isWorkshop && !participant,
    });
    const folderName =
        library?.workspaces.find((w) => w.id === folderId)?.name ?? scope?.name ?? "";

    const libraryItem =
        library &&
        [...library.defaultItems, ...library.workspaces.flatMap((w) => w.items)].find(
            (i) => i.kind === item.kind && i.id === item.id,
        );

    return (
        <PageHeader
            start={item.kind === "report" ? null : <ModelControl compact />}
            center={
                <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm">
                    {folderId && (
                        <>
                            <Link
                                href={workspacePath(folderId)}
                                title={folderName}
                                className="hidden min-w-0 max-w-[12rem] truncate rounded-md px-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:block"
                            >
                                {folderName || "Workspace"}
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
                            fallback={
                                libraryItem && !itemLabel(libraryItem).placeholder
                                    ? itemLabel(libraryItem).text
                                    : ""
                            }
                            editing={renaming}
                            onEditingChange={setRenaming}
                        />
                    ) : item.kind === "chat" ? (
                        <ChatTitle
                            chatId={item.id}
                            editing={renaming}
                            onEditingChange={setRenaming}
                        />
                    ) : (
                        <ReportTitle reportId={item.id} />
                    )}
                </nav>
            }
            end={
                <>
                    {item.kind === "chart" && (
                        <ChartExport chartId={item.id} workspaceName={scope?.name} />
                    )}
                    {libraryItem && !isWorkshop && (
                        <ItemActionsMenu
                            item={libraryItem}
                            workspaces={library.workspaces}
                            folder={folderId ? { id: folderId, name: folderName } : null}
                            active
                            onRename={() => setRenaming(true)}
                            variant="header"
                            align="end"
                        />
                    )}
                </>
            }
        />
    );
}

/** The chart's Export menu, from the queries its page uses; none until the
 *  chart has a result that can be drawn. */
function ChartExport({ chartId, workspaceName }: { chartId: string; workspaceName?: string }) {
    const darkMode = useIsDark();
    const { data: chart } = useQuery({
        queryKey: queryKeys.charts.chart(chartId),
        queryFn: () => getChartById(chartId),
    });
    const { data: config } = useQuery({
        queryKey: queryKeys.charts.configByChart(chartId),
        queryFn: () => getConfigForChart(chartId),
    });
    if (!chart || chartFigure(chart, config).gap) return null;
    return (
        <ChartExportMenu
            chart={chart}
            config={config}
            darkMode={darkMode}
            workspaceName={workspaceName}
        />
    );
}

const titleClass = "min-w-0 truncate rounded-md px-1 text-sm font-medium";

/**
 * The chart's name; click it (or pick Rename) to edit it in place. An unnamed
 * chart reads as `fallback`, its prompt as the sidebar shows it.
 */
function ChartTitle({
    chartId,
    fallback,
    editing,
    onEditingChange,
}: {
    chartId: string;
    fallback: string;
    editing: boolean;
    onEditingChange: (editing: boolean) => void;
}) {
    const { data: chart } = useQuery({
        queryKey: queryKeys.charts.chart(chartId),
        queryFn: () => getChartById(chartId),
    });
    const { mutate: renameChart } = useUpdateChartName();
    const hintId = useId();
    const savedName = chartName(chart?.name);
    const [pendingName, setPendingName] = useState<string | null>(null);
    const name = pendingName ?? savedName;

    useEffect(() => setPendingName(null), [savedName]);

    if (editing) {
        return (
            <InlineNameInput
                initialValue={name}
                ariaLabel="Chart name"
                placeholder={fallback || "Untitled chart"}
                className="h-7 w-64 max-w-full px-2 font-medium"
                onDone={(next) => {
                    onEditingChange(false);
                    if (next === null || next === name) return;
                    setPendingName(next);
                    renameChart({ chartId, name: next || DEFAULT_CHART_NAME });
                }}
            />
        );
    }

    const shown = name || fallback;
    return (
        <>
            <h1 className="flex min-w-0">
                <button
                    type="button"
                    onClick={() => onEditingChange(true)}
                    title={shown ? `${shown} (click to rename)` : "Click to name this chart"}
                    aria-describedby={hintId}
                    className={cn(
                        titleClass,
                        "cursor-text transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                        !shown && "text-muted-foreground",
                    )}
                >
                    {chart ? shown || "Untitled chart" : "\u00a0"}
                </button>
            </h1>
            <span id={hintId} className="sr-only">
                Click to rename
            </span>
        </>
    );
}

/** The chat's name; click it (or pick Rename) to edit it in place. */
function ChatTitle({
    chatId,
    editing,
    onEditingChange,
}: {
    chatId: string;
    editing: boolean;
    onEditingChange: (editing: boolean) => void;
}) {
    const { data: chat } = useChat(chatId);
    const { mutate: updateChat } = useUpdateChat();
    const hintId = useId();
    const name = chat?.name ?? "";
    const unnamed = name === DEFAULT_CHAT_NAME;

    if (editing) {
        return (
            <InlineNameInput
                initialValue={unnamed ? "" : name}
                ariaLabel="Chat name"
                placeholder={DEFAULT_CHAT_NAME}
                className="h-7 w-64 max-w-full px-2 font-medium"
                onDone={(next) => {
                    onEditingChange(false);
                    if (next === null || next === name || (unnamed && !next)) return;
                    updateChat({ chatId, settings: { name: next } });
                }}
            />
        );
    }

    return (
        <>
            <h1 className="flex min-w-0">
                <button
                    type="button"
                    onClick={() => onEditingChange(true)}
                    title={`${name} (click to rename)`}
                    aria-describedby={hintId}
                    className={cn(
                        titleClass,
                        "cursor-text transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                        unnamed && "text-muted-foreground",
                    )}
                >
                    {chat ? name : "\u00a0"}
                </button>
            </h1>
            <span id={hintId} className="sr-only">
                Click to rename
            </span>
        </>
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
