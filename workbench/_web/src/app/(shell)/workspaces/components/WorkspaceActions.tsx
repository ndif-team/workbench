"use client";

import { useRef, useState } from "react";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDeleteWorkspace } from "@/lib/api/workspaceApi";
import { cn } from "@/lib/utils";
import type { LibraryWorkspace } from "@/types/workspaces";

/** "6 charts and 1 report", "1 chart", "nothing". */
export function describeContents(workspace: LibraryWorkspace): string {
    const charts = workspace.items.filter((i) => i.kind === "chart").length;
    const reports = workspace.items.length - charts;
    const parts = [
        charts > 0 && `${charts} chart${charts === 1 ? "" : "s"}`,
        reports > 0 && `${reports} report${reports === 1 ? "" : "s"}`,
    ].filter(Boolean);
    return parts.length ? parts.join(" and ") : "nothing";
}

/**
 * A workspace's Rename and Delete. Delete confirms in a dialog that says what
 * goes with the workspace, since its charts and reports are deleted too.
 */
export function WorkspaceActionsMenu({
    workspace,
    onRename,
    onDeleted,
    variant = "row",
}: {
    workspace: LibraryWorkspace;
    onRename: () => void;
    onDeleted?: () => void;
    variant?: "row" | "header";
}) {
    const [confirming, setConfirming] = useState(false);
    // Rename and Delete… move focus elsewhere, so they run once the menu has
    // closed, in place of its return to the trigger.
    const afterCloseRef = useRef<(() => void) | null>(null);

    return (
        <>
            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Workspace actions"
                        className={cn(
                            variant === "row"
                                ? "size-7 text-muted-foreground/40 hover:text-foreground focus-visible:text-foreground data-[state=open]:text-foreground"
                                : "text-muted-foreground hover:text-foreground data-[state=open]:bg-accent",
                        )}
                    >
                        <MoreVertical className={variant === "row" ? "size-3.5" : "size-4"} />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="end"
                    className="w-44"
                    onCloseAutoFocus={(e) => {
                        const action = afterCloseRef.current;
                        if (!action) return;
                        afterCloseRef.current = null;
                        e.preventDefault();
                        action();
                    }}
                >
                    <DropdownMenuItem
                        onSelect={() => {
                            afterCloseRef.current = onRename;
                        }}
                    >
                        <Pencil />
                        Rename
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        onSelect={() => {
                            afterCloseRef.current = () => setConfirming(true);
                        }}
                        className="text-destructive focus:text-destructive [&>svg]:text-destructive"
                    >
                        <Trash2 />
                        Delete…
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <DeleteWorkspaceDialog
                workspace={workspace}
                open={confirming}
                onOpenChange={setConfirming}
                onDeleted={onDeleted}
            />
        </>
    );
}

function DeleteWorkspaceDialog({
    workspace,
    open,
    onOpenChange,
    onDeleted,
}: {
    workspace: LibraryWorkspace;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onDeleted?: () => void;
}) {
    const deleteWorkspace = useDeleteWorkspace();
    const contents = describeContents(workspace);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[420px]">
                <DialogHeader>
                    <DialogTitle className="break-words">Delete {workspace.name}?</DialogTitle>
                    <DialogDescription>
                        {contents === "nothing"
                            ? "The workspace is empty. You can't undo this."
                            : `This also deletes the ${contents} in it. You can't undo this.`}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        disabled={deleteWorkspace.isPending}
                        onClick={() =>
                            deleteWorkspace.mutate(
                                { workspaceId: workspace.id },
                                {
                                    onSuccess: () => {
                                        onOpenChange(false);
                                        onDeleted?.();
                                    },
                                },
                            )
                        }
                    >
                        Delete workspace
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
