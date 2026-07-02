"use client";

import { useState } from "react";
import { Link2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { WorkshopWithCount } from "@/lib/queries/workshopDb";
import type { WorkshopTool } from "@/db/schema";
import { splitRepo } from "@/components/model-selector/status";

export const WORKSHOP_TOOL_LABELS: Record<WorkshopTool, string> = {
    lens2: "Logit Lens",
    "activation-patching": "Activation Patching",
    "patch-lens": "Patch Lens",
};

const formatExpiry = (expiresAt: Date) =>
    new Date(expiresAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    });

/** Presentational card for one workshop config with its row actions. */
export function WorkshopRow({
    workshop,
    onEdit,
    onDelete,
}: {
    workshop: WorkshopWithCount;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const expired = new Date(workshop.expiresAt) < new Date();

    const copyJoinLink = async () => {
        const url = `${window.location.origin}/w/${workshop.slug}`;
        await navigator.clipboard.writeText(url);
        toast.success("Join link copied");
    };

    return (
        <div data-testid="workshop-row" className="rounded-md border bg-card p-4 shadow-xs">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium truncate">{workshop.name}</h3>
                        {expired && (
                            <span className="text-xs text-muted-foreground shrink-0">Expired</span>
                        )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {workshop.allowedTools
                            .map((tool) => WORKSHOP_TOOL_LABELS[tool] ?? tool)
                            .join(" · ")}
                        {" · "}
                        <span className="font-mono text-xs" title={workshop.model}>
                            {splitRepo(workshop.model).label}
                        </span>
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                        {expired ? "Ended" : "Expires"} {formatExpiry(workshop.expiresAt)}
                        {" · "}
                        {workshop.participantCount} participant
                        {workshop.participantCount === 1 ? "" : "s"}
                    </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground/40 hover:text-foreground"
                        title="Copy join link"
                        onClick={copyJoinLink}
                    >
                        <Link2 className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground/40 hover:text-foreground"
                        title="Edit workshop"
                        onClick={onEdit}
                    >
                        <Pencil className="h-4 w-4" />
                    </Button>
                    <Popover open={confirmOpen} onOpenChange={setConfirmOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground/40 hover:text-destructive"
                                title="Delete workshop"
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-64">
                            <p className="text-sm">
                                Delete “{workshop.name}”? The join link stops working; participant
                                workspaces are kept.
                            </p>
                            <div className="mt-3 flex justify-end gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setConfirmOpen(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => {
                                        setConfirmOpen(false);
                                        onDelete();
                                    }}
                                >
                                    Delete
                                </Button>
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>
            </div>
        </div>
    );
}
