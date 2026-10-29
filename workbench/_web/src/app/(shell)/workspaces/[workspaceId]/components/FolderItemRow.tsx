"use client";

import Link from "next/link";

import { splitRepo } from "@/components/model-selector/status";
import { cn } from "@/lib/utils";
import type { LibraryItem, LibraryWorkspace } from "@/types/workspaces";
import { InlineNameInput } from "../../../components/items/InlineNameInput";
import { ItemActionsMenu } from "../../../components/items/ItemActionsMenu";
import { formatTimestamp, formatUpdated } from "../../../components/items/formatUpdated";
import { chartName, itemIcon, itemLabel, itemPath } from "../../../components/items/itemLabel";
import { toolMeta } from "../../../components/toolMeta";
import { useDeployStateOf } from "../../../components/useDeployStateOf";

const DEPLOY_LABEL = {
    cold: "Not deployed",
    deploying: "Deploying",
    failed: "Deployment failed",
} as const;

/**
 * A chart or report on a workspace page: label, tool, model and last update,
 * plus the item's actions. The row's left gutter holds the drag handle that
 * `SortableEntry` overlays.
 */
export function FolderItemRow({
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
        <div className="group/row relative flex h-10 items-center gap-3 rounded-md pl-7 pr-1 transition-colors hover:bg-accent has-[[data-state=open]]:bg-accent dark:hover:bg-accent/50 dark:has-[[data-state=open]]:bg-accent/50">
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
                        "min-w-0 flex-1 truncate text-sm outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50",
                        label.placeholder && "text-muted-foreground",
                    )}
                >
                    {label.text}
                </Link>
            )}
            {deployState && (
                <span
                    className={cn(
                        "hidden shrink-0 text-xs sm:inline",
                        deployState === "failed" ? "text-destructive" : "text-muted-foreground",
                    )}
                >
                    {DEPLOY_LABEL[deployState]}
                </span>
            )}
            <span className="hidden w-32 shrink-0 truncate text-xs text-muted-foreground md:inline">
                {isChart ? (tool?.label ?? "Retired tool") : "Report"}
            </span>
            <span
                className="hidden w-40 shrink-0 truncate font-mono text-xs text-muted-foreground lg:inline"
                title={isChart ? (item.model ?? undefined) : undefined}
            >
                {isChart && item.model ? splitRepo(item.model).label : ""}
            </span>
            <span
                className="hidden w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:inline"
                title={formatTimestamp(item.updatedAt)}
            >
                {formatUpdated(item.updatedAt)}
            </span>
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
    );
}

/** A loading row shaped like `FolderItemRow`. */
export function FolderItemRowSkeleton() {
    return (
        <div className="flex h-10 items-center gap-3 pl-8 pr-3">
            <div className="size-4 shrink-0 rounded-sm bg-border animate-pulse" />
            <div className="h-3 w-1/3 rounded-sm bg-border animate-pulse" />
            <div className="ml-auto hidden h-3 w-24 rounded-sm bg-border animate-pulse md:block" />
        </div>
    );
}
