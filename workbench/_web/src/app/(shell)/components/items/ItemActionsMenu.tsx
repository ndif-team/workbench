"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
    Copy,
    Folder,
    FolderInput,
    FolderMinus,
    FolderPlus,
    MoreVertical,
    Pencil,
    Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { CreateWorkspaceDialog } from "@/components/CreateWorkspaceDialog";
import { useCopyChart, useDeleteChart } from "@/lib/api/chartApi";
import { useDeleteDocument } from "@/lib/api/documentApi";
import { useMoveChart, useMoveReport, type MoveVia } from "@/lib/api/workspaceApi";
import { chartPath, workspacePath } from "@/lib/chartRoutes";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import type { LibraryItem, LibraryWorkspace, WorkspaceLibrary } from "@/types/workspaces";
import { itemLabel, itemPath } from "./itemLabel";
import { neighborInList } from "./workspaceContents";

interface ItemActionsMenuProps {
    item: LibraryItem;
    /** The user's folders; workshop folders and the item's own are left out of "Move to workspace". */
    workspaces: LibraryWorkspace[];
    /** Set when the item is filed in a folder rather than the default workspace. */
    folder: { id: string; name: string } | null;
    /** The item is the page on screen, so deleting it navigates away. */
    active: boolean;
    /** Starts renaming the chart where it is shown; charts only. */
    onRename?: () => void;
    /** "row" is the faint sidebar/list trigger; "header" sits in a page header. */
    variant?: "row" | "header";
    /** Where the menu and the delete confirmation open; beside a sidebar row, below anything else. */
    side?: "right" | "bottom";
    align?: "start" | "end";
}

/**
 * Moves a chart or report to a folder (null: back to the default workspace)
 * and says where it went. Shared by the actions menu and dropping a chart on
 * a sidebar folder (`via`).
 */
export function useMoveItem() {
    const moveChart = useMoveChart();
    const moveReport = useMoveReport();
    return (
        item: LibraryItem,
        target: { id: string; name: string } | null,
        from: { name: string } | null,
        via: MoveVia,
    ) => {
        const onSuccess = () =>
            toast.success(target ? `Moved to ${target.name}` : `Removed from ${from?.name}`);
        const targetWorkspaceId = target?.id ?? null;
        if (item.kind === "chart") {
            moveChart.mutate({ chartId: item.id, targetWorkspaceId, via }, { onSuccess });
        } else {
            moveReport.mutate({ documentId: item.id, targetWorkspaceId, via }, { onSuccess });
        }
    };
}

/**
 * The actions of a chart or report: Rename, Copy, Move to workspace (an
 * existing folder or a new one), Remove from workspace, Delete. Delete asks
 * for confirmation in a popover beside the trigger, and the trigger keeps
 * `data-state="open"` meanwhile so its row stays highlighted. Deleting the
 * item on screen opens the next one in its list (`neighborInList`), else its
 * folder's page, else the workspaces page. Shared by the sidebar rows, the
 * item page header and the workspace page.
 *
 * Rename, Delete… and New workspace… move focus elsewhere, so they run once
 * the menu has closed (`afterCloseRef`), in place of its return of focus to
 * the trigger.
 */
export function ItemActionsMenu({
    item,
    workspaces,
    folder,
    active,
    onRename,
    variant = "row",
    side = variant === "row" ? "right" : "bottom",
    align = "start",
}: ItemActionsMenuProps) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [creatingWorkspace, setCreatingWorkspace] = useState(false);
    const afterCloseRef = useRef<(() => void) | null>(null);

    const moveItem = useMoveItem();
    const copyChart = useCopyChart();
    const deleteChart = useDeleteChart();
    const deleteReport = useDeleteDocument();

    const noun = item.kind;
    const label = itemLabel(item).text;
    const moveTargets = workspaces.filter((w) => !w.isWorkshop && w.id !== item.workspaceId);

    const move = (target: { id: string; name: string } | null) =>
        moveItem(item, target, folder, "menu");

    const copy = () => {
        if (item.kind !== "chart") return;
        copyChart.mutate(item.id, {
            onSuccess: (copied) => {
                toast.success("Chart copied");
                router.push(chartPath(copied.id, item.toolType, copied.workspaceId));
            },
            onError: () => toast.error("Couldn't copy the chart"),
        });
    };

    const remove = () => {
        const library = queryClient.getQueryData<WorkspaceLibrary>(queryKeys.workspaces.library);
        const next = active && library ? neighborInList(library, item) : null;
        const onSuccess = () => {
            setConfirmingDelete(false);
            if (!active) return;
            router.replace(
                next ? itemPath(next) : folder ? workspacePath(folder.id) : "/workspaces",
            );
        };
        const onError = () => toast.error(`Couldn't delete the ${noun}`);
        if (item.kind === "chart") {
            deleteChart.mutate(
                { chartId: item.id, workspaceId: item.workspaceId },
                { onSuccess, onError },
            );
        } else {
            deleteReport.mutate(
                { documentId: item.id, workspaceId: item.workspaceId },
                { onSuccess, onError },
            );
        }
    };

    const isDeleting = deleteChart.isPending || deleteReport.isPending;

    const afterClose = (action: () => void) => () => {
        afterCloseRef.current = action;
    };

    return (
        <>
            <Popover open={confirmingDelete} onOpenChange={setConfirmingDelete}>
                <DropdownMenu modal={false}>
                    <PopoverAnchor asChild>
                        <DropdownMenuTrigger
                            asChild
                            {...(confirmingDelete ? { "data-state": "open" } : {})}
                        >
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={`${noun === "chart" ? "Chart" : "Report"} actions`}
                                className={cn(
                                    variant === "row"
                                        ? "size-6 text-muted-foreground/40 group-data-[variant=drawer]/sidebar:size-8 hover:text-foreground focus-visible:text-foreground data-[state=open]:text-foreground"
                                        : "text-muted-foreground hover:text-foreground data-[state=open]:bg-accent",
                                )}
                            >
                                <MoreVertical
                                    className={variant === "row" ? "size-3.5" : "size-4"}
                                />
                            </Button>
                        </DropdownMenuTrigger>
                    </PopoverAnchor>
                    <DropdownMenuContent
                        side={side}
                        align={align}
                        className="w-52"
                        onCloseAutoFocus={(e) => {
                            const action = afterCloseRef.current;
                            if (!action) return;
                            afterCloseRef.current = null;
                            e.preventDefault();
                            action();
                        }}
                    >
                        {item.kind === "chart" && onRename && (
                            <DropdownMenuItem onSelect={afterClose(onRename)}>
                                <Pencil />
                                Rename
                            </DropdownMenuItem>
                        )}
                        {item.kind === "chart" && (
                            <DropdownMenuItem onSelect={copy} disabled={copyChart.isPending}>
                                <Copy />
                                Copy
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                                <FolderInput className="text-muted-foreground" />
                                Move to workspace
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
                                {moveTargets.map((w) => (
                                    <DropdownMenuItem key={w.id} onSelect={() => move(w)}>
                                        <Folder />
                                        <span className="truncate" title={w.name}>
                                            {w.name}
                                        </span>
                                    </DropdownMenuItem>
                                ))}
                                {moveTargets.length > 0 && <DropdownMenuSeparator />}
                                <DropdownMenuItem
                                    onSelect={afterClose(() => setCreatingWorkspace(true))}
                                >
                                    <FolderPlus />
                                    New workspace…
                                </DropdownMenuItem>
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        {folder && (
                            <DropdownMenuItem onSelect={() => move(null)}>
                                <FolderMinus />
                                Remove from workspace
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onSelect={afterClose(() => setConfirmingDelete(true))}
                            className="text-destructive focus:text-destructive [&>svg]:text-destructive"
                        >
                            <Trash2 />
                            Delete…
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                <PopoverContent
                    align={align}
                    side={side}
                    className="w-64 p-3"
                    onClick={(e) => e.stopPropagation()}
                >
                    <ConfirmDelete
                        title={`Delete this ${noun}?`}
                        detail={
                            <>
                                <span className="font-medium text-foreground">{label}</span> will be
                                deleted. You can&apos;t undo this.
                            </>
                        }
                        pending={isDeleting}
                        onCancel={() => setConfirmingDelete(false)}
                        onConfirm={remove}
                    />
                </PopoverContent>
            </Popover>
            <CreateWorkspaceDialog
                open={creatingWorkspace}
                onOpenChange={setCreatingWorkspace}
                submitLabel={`Create and move ${noun}`}
                origin="move_menu"
                onCreated={(workspace) => move({ id: workspace.id, name: workspace.name })}
            />
        </>
    );
}

/** The body of a delete confirmation popover. */
export function ConfirmDelete({
    title,
    detail,
    pending,
    onCancel,
    onConfirm,
}: {
    title: string;
    detail: ReactNode;
    pending: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">{title}</p>
                <p className="break-words text-sm text-muted-foreground">{detail}</p>
            </div>
            <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onCancel}>
                    Cancel
                </Button>
                <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={onConfirm}
                    disabled={pending}
                >
                    Delete
                </Button>
            </div>
        </div>
    );
}
