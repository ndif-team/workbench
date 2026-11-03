"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";

import { splitRepo } from "@/components/model-selector/status";
import type { ChartFigureGap } from "@/lib/report/chartFigure";
import { cn } from "@/lib/utils";
import type { LibraryChartItem, LibraryItem, LibraryWorkspace } from "@/types/workspaces";
import { InlineNameInput } from "../../../components/items/InlineNameInput";
import { ItemActionsMenu } from "../../../components/items/ItemActionsMenu";
import { formatTimestamp, formatUpdated } from "../../../components/items/formatUpdated";
import { chartName, itemIcon, itemLabel, itemPath } from "../../../components/items/itemLabel";
import { toolMeta } from "../../../components/toolMeta";
import { useDeployStateOf } from "../../../components/useDeployStateOf";
import { DEPLOY_LABEL } from "./FolderItemRow";
import { useChartPreview, useSeenOnScreen } from "./useChartPreview";

/** The cards on all workspaces' page, set straight on the page. */
const CARD = "rounded border bg-secondary/80 dark:bg-secondary/50 transition-colors duration-100";

/**
 * A chart or report on a workspace page's grid: a preview on top (the chart
 * drawn from its saved view, or a report's cover), then its label and
 * actions, then its tool, model and last update. The whole card opens the
 * item; `SortableEntry` puts the drag handle in its top-left corner.
 */
export function FolderItemCard({
    item,
    folder,
    workspaces,
    renaming,
    onRenameStart,
    onRenameEnd,
}: {
    item: LibraryItem;
    folder: LibraryWorkspace;
    workspaces: LibraryWorkspace[];
    renaming: boolean;
    onRenameStart: () => void;
    /** The new name, or null when renaming was cancelled or left unchanged. */
    onRenameEnd: (name: string | null) => void;
}) {
    const deployStateOf = useDeployStateOf();
    const Icon = itemIcon(item);
    const label = itemLabel(item);
    const isChart = item.kind === "chart";
    const tool = isChart ? toolMeta(item.toolType) : undefined;
    const deployState = isChart ? deployStateOf(item) : null;

    return (
        <div
            className={cn(
                CARD,
                "group/card relative flex h-full flex-col overflow-hidden hover:border-foreground/20 hover:bg-secondary dark:hover:bg-secondary/70 has-[[data-state=open]]:border-foreground/20",
            )}
        >
            <div className="aspect-[16/10] overflow-hidden border-b">
                {isChart ? <ChartPreviewImage item={item} /> : <ReportCover reportId={item.id} />}
            </div>
            <div className="flex items-center gap-2 py-1.5 pl-3 pr-1.5">
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                {renaming && isChart ? (
                    <InlineNameInput
                        initialValue={chartName(item.name)}
                        ariaLabel="Chart name"
                        placeholder="Untitled chart"
                        className="h-7 min-w-0 flex-1 px-2 text-sm"
                        onDone={(name) =>
                            onRenameEnd(name && name !== chartName(item.name) ? name : null)
                        }
                    />
                ) : (
                    <Link
                        href={itemPath(item)}
                        title={label.text}
                        className={cn(
                            "min-w-0 flex-1 truncate text-sm font-medium outline-none after:absolute after:inset-0 after:rounded focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50",
                            label.placeholder && "font-normal text-muted-foreground",
                        )}
                    >
                        {label.text}
                    </Link>
                )}
                <div className="relative z-10 shrink-0">
                    {folder.isWorkshop ? (
                        <span className="block size-6" />
                    ) : (
                        <ItemActionsMenu
                            item={item}
                            workspaces={workspaces}
                            folder={folder}
                            active={false}
                            onRename={isChart ? onRenameStart : undefined}
                            side="bottom"
                            align="end"
                        />
                    )}
                </div>
            </div>
            <div className="flex items-center gap-1.5 px-3 pb-2.5 text-xs text-muted-foreground">
                <span className="min-w-0 truncate">
                    {isChart ? (tool?.label ?? "Retired tool") : "Report"}
                    {isChart && item.model && (
                        <>
                            {" · "}
                            <span className="font-mono" title={item.model}>
                                {splitRepo(item.model).label}
                            </span>
                        </>
                    )}
                </span>
                {deployState && (
                    <span
                        className={cn("shrink-0", deployState === "failed" && "text-destructive")}
                    >
                        {DEPLOY_LABEL[deployState]}
                    </span>
                )}
                <span
                    className="ml-auto shrink-0 whitespace-nowrap tabular-nums"
                    title={formatTimestamp(item.updatedAt)}
                >
                    {formatUpdated(item.updatedAt)}
                </span>
            </div>
        </div>
    );
}

/** Why a card shows no picture, in place of the chart. */
const GAP_TEXT: Record<ChartFigureGap, string> = {
    "not-run": "Not run yet",
    unsupported: "No preview for this tool yet",
    retired: "Made with a retired tool",
    missing: "This chart was deleted",
};

/** The chart drawn as an image once its card is on screen, or why it can't be. */
function ChartPreviewImage({ item }: { item: LibraryChartItem }) {
    const [ref, seen] = useSeenOnScreen<HTMLDivElement>();
    const preview = useChartPreview(item.id, seen && item.hasData);
    const tool = toolMeta(item.toolType);
    const ToolIcon = tool?.Icon ?? FileText;

    const note = (text: string) => <PreviewNote icon={<ToolIcon />}>{text}</PreviewNote>;
    let body: ReactNode;
    if (!item.hasData) body = note(GAP_TEXT["not-run"]);
    else if (preview.status === "ready") {
        body = (
            <img
                src={preview.image.dataUrl}
                alt=""
                draggable={false}
                className="size-full object-contain"
            />
        );
    } else if (preview.status === "gap") body = note(GAP_TEXT[preview.gap]);
    else if (preview.status === "failed") body = note("Couldn't draw a preview");
    else body = <div className="size-full animate-pulse bg-secondary" />;

    // A drawn chart sits inset on its own background color, so the card's
    // thumbnail reads as one picture whatever the chart's shape.
    const ready = preview.status === "ready";
    return (
        <div
            ref={ref}
            className={cn("size-full bg-background", ready && "p-2")}
            style={ready && preview.surface ? { background: preview.surface } : undefined}
        >
            {body}
        </div>
    );
}

function PreviewNote({ icon, children }: { icon: ReactNode; children: ReactNode }) {
    return (
        <div className="flex size-full flex-col items-center justify-center gap-2 bg-secondary/80 text-xs text-muted-foreground dark:bg-secondary/50 [&_svg]:size-5">
            {icon}
            {children}
        </div>
    );
}

/** Where a report's cover puts its three blobs, from the report's id. */
function coverPlacement(reportId: string): CSSProperties {
    const unit = (salt: number) => {
        let hash = 2166136261 ^ salt;
        for (const ch of reportId) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
        return (hash >>> 0) / 0xffffffff;
    };
    const spot = (salt: number) =>
        `${Math.round(10 + unit(salt) * 80)}% ${Math.round(5 + unit(salt + 7) * 90)}%`;
    return { "--cover-a": spot(1), "--cover-b": spot(2), "--cover-c": spot(3) } as CSSProperties;
}

function ReportCover({ reportId }: { reportId: string }) {
    return (
        <div
            aria-hidden
            className="powder-cover flex size-full items-center justify-center"
            style={coverPlacement(reportId)}
        >
            <FileText className="relative z-10 size-6 text-white" />
        </div>
    );
}

/** A loading card shaped like `FolderItemCard`. */
export function FolderItemCardSkeleton() {
    return (
        <div className={cn(CARD, "flex flex-col overflow-hidden")}>
            <div className="aspect-[16/10] animate-pulse border-b bg-secondary" />
            <div className="flex h-10 items-center gap-2 px-3">
                <div className="size-4 shrink-0 rounded-sm bg-border animate-pulse" />
                <div className="h-3 w-1/2 rounded-sm bg-border animate-pulse" />
            </div>
            <div className="px-3 pb-3">
                <div className="h-2.5 w-1/3 rounded-sm bg-border animate-pulse" />
            </div>
        </div>
    );
}
