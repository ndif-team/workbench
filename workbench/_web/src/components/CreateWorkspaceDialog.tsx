"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateWorkspace } from "@/lib/api/workspaceApi";
import { workspacePath } from "@/lib/chartRoutes";
import type { Workspace } from "@/db/schema";

interface CreateWorkspaceDialogProps {
    /** Opens the dialog; omit to control it with `open` / `onOpenChange`. */
    trigger?: ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Runs after the workspace is created. Defaults to opening its page. */
    onCreated?: (workspace: Workspace) => void;
    /** The dialog's primary button label. */
    submitLabel?: string;
}

/** Names and creates a workspace (folder). Used by the sidebar, the workspaces page and "Move to workspace". */
export function CreateWorkspaceDialog({
    trigger,
    open: controlledOpen,
    onOpenChange,
    onCreated,
    submitLabel = "Create workspace",
}: CreateWorkspaceDialogProps) {
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
    const open = controlledOpen ?? uncontrolledOpen;
    const [name, setName] = useState("");
    const router = useRouter();
    const createWorkspace = useCreateWorkspace();

    const setOpen = (next: boolean) => {
        if (!next) setName("");
        setUncontrolledOpen(next);
        onOpenChange?.(next);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        try {
            const workspace = await createWorkspace.mutateAsync({ name: trimmed });
            setOpen(false);
            if (onCreated) onCreated(workspace);
            else router.push(workspacePath(workspace.id));
        } catch {
            toast.error("Couldn't create the workspace");
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle>New workspace</DialogTitle>
                    <DialogDescription>
                        A workspace groups related charts and reports, like a project folder.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="workspace-name">Name</Label>
                        <Input
                            id="workspace-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. IOI circuit"
                            autoComplete="off"
                            autoFocus
                            required
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setOpen(false)}
                            disabled={createWorkspace.isPending}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={!name.trim() || createWorkspace.isPending}>
                            {createWorkspace.isPending ? "Creating…" : submitLabel}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
