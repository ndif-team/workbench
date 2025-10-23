"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
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
import { useRouter } from "next/navigation";

interface CreateWorkspaceDialogProps {
    userId: string;
}

export function CreateWorkspaceDialog({ userId }: CreateWorkspaceDialogProps) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const router = useRouter();
    const createWorkspaceMutation = useCreateWorkspace();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        try {
            const newWorkspace = await createWorkspaceMutation.mutateAsync({
                userId,
                name: name.trim(),
            });

            setOpen(false);
            setName("");
            // Navigate to workspace - chart will be created automatically
            router.push(`/workbench/${newWorkspace.id}`);
        } catch (error) {
            console.error("Failed to create workspace:", error);
            // You might want to show a toast notification here
        }
    };

    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) {
            setName("");
        }
        setOpen(newOpen);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button
                    variant="outline"
                    className="px-4 py-3 border bg-blue-500/10 hover:bg-blue-400/40 border-blue-400/40 hover:border-blue-400 transition-all flex items-center gap-2"
                >
                    <Plus className="h-4 w-4" />
                    workspace
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Create New Workspace</DialogTitle>
                    <DialogDescription>
                        Create a new workspace to start exploring your model's behavior. You can add
                        Logit Lens and Activation Patching collections after creation.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-3">
                            <Label htmlFor="name">Workspace Name</Label>
                            <Input
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Enter workspace name..."
                                required
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setOpen(false)}
                            disabled={createWorkspaceMutation.isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={!name.trim() || createWorkspaceMutation.isPending}
                        >
                            {createWorkspaceMutation.isPending ? "Creating..." : "Create Workspace"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
