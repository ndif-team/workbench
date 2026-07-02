"use client";

import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useModelsQuery } from "@/lib/api/modelsApi";
import { useCreateWorkshop, useUpdateWorkshop } from "@/lib/api/workshopApi";
import type { WorkshopWithCount } from "@/lib/queries/workshopDb";
import { workshopTools, type WorkshopTool } from "@/db/schema";
import { WORKSHOP_TOOL_LABELS } from "./WorkshopRow";

// datetime-local wants a zone-less local string; Date#toISOString is UTC.
const toDatetimeLocal = (date: Date) => {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(
        date.getHours(),
    )}:${p(date.getMinutes())}`;
};

const defaultExpiry = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d;
};

/** Create/edit form for a workshop config. `target` is "new" or the workshop to edit. */
export function WorkshopFormDialog({
    target,
    onClose,
}: {
    target: WorkshopWithCount | "new" | null;
    onClose: () => void;
}) {
    const isEdit = target !== null && target !== "new";
    const { data: models } = useModelsQuery();
    const { mutate: createWorkshop, isPending: isCreating } = useCreateWorkshop();
    const { mutate: updateWorkshop, isPending: isUpdating } = useUpdateWorkshop();
    const isPending = isCreating || isUpdating;

    const [name, setName] = useState("");
    const [tools, setTools] = useState<WorkshopTool[]>(["lens2"]);
    const [model, setModel] = useState("");
    const [starterPrompt, setStarterPrompt] = useState("");
    const [expiresAt, setExpiresAt] = useState(toDatetimeLocal(defaultExpiry()));

    // Re-seed the fields whenever the dialog opens for a different target.
    useEffect(() => {
        if (target === null) return;
        if (target === "new") {
            setName("");
            setTools(["lens2"]);
            setModel("");
            setStarterPrompt("");
            setExpiresAt(toDatetimeLocal(defaultExpiry()));
        } else {
            setName(target.name);
            setTools(target.allowedTools);
            setModel(target.model);
            setStarterPrompt(target.starterPrompt);
            setExpiresAt(toDatetimeLocal(new Date(target.expiresAt)));
        }
    }, [target]);

    const toggleTool = (tool: WorkshopTool, checked: boolean) => {
        setTools((prev) => (checked ? [...prev, tool] : prev.filter((t) => t !== tool)));
    };

    const canSubmit = name.trim() !== "" && tools.length > 0 && model !== "" && expiresAt !== "";

    const handleSubmit = () => {
        if (!canSubmit) return;
        // Keep the tool order canonical rather than click order.
        const orderedTools = workshopTools.filter((t) => tools.includes(t));
        const payload = {
            name: name.trim(),
            allowedTools: orderedTools,
            model,
            starterPrompt,
            expiresAt: new Date(expiresAt),
        };
        if (isEdit) {
            updateWorkshop({ id: target.id, updates: payload }, { onSuccess: () => onClose() });
        } else {
            createWorkshop(payload, {
                onSuccess: (created) => {
                    navigator.clipboard
                        .writeText(`${window.location.origin}/w/${created.slug}`)
                        .then(() => toast.success("Workshop created — join link copied"))
                        .catch(() => toast.success("Workshop created"));
                    onClose();
                },
            });
        }
    };

    const copyJoinLink = async () => {
        if (!isEdit) return;
        await navigator.clipboard.writeText(`${window.location.origin}/w/${target.slug}`);
        toast.success("Join link copied");
    };

    return (
        <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{isEdit ? "Edit workshop" : "New workshop"}</DialogTitle>
                    <DialogDescription>
                        Participants who open the join link get a workspace limited to these tools
                        and model.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="workshop-name">Name</Label>
                        <Input
                            id="workshop-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Faculty pilot — July session"
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label>Tools</Label>
                        <div className="flex flex-col gap-2">
                            {workshopTools.map((tool) => (
                                <label
                                    key={tool}
                                    className="flex items-center gap-2 text-sm font-normal"
                                >
                                    <Checkbox
                                        checked={tools.includes(tool)}
                                        onCheckedChange={(checked) =>
                                            toggleTool(tool, checked === true)
                                        }
                                    />
                                    {WORKSHOP_TOOL_LABELS[tool]}
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label htmlFor="workshop-model">Model</Label>
                        {models && models.length > 0 ? (
                            <Select value={model} onValueChange={setModel}>
                                <SelectTrigger id="workshop-model">
                                    <SelectValue placeholder="Select a model" />
                                </SelectTrigger>
                                <SelectContent>
                                    {models.map((m) => (
                                        <SelectItem key={m.name} value={m.name}>
                                            {m.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : (
                            <Input
                                id="workshop-model"
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                                placeholder="meta-llama/Llama-3.1-8B"
                            />
                        )}
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label htmlFor="workshop-prompt">Starter prompt</Label>
                        <Textarea
                            id="workshop-prompt"
                            value={starterPrompt}
                            onChange={(e) => setStarterPrompt(e.target.value)}
                            placeholder="Seeded into the first chart (optional)"
                            className="font-mono min-h-20"
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label htmlFor="workshop-expiry">Join link expires</Label>
                        <Input
                            id="workshop-expiry"
                            type="datetime-local"
                            value={expiresAt}
                            onChange={(e) => setExpiresAt(e.target.value)}
                        />
                    </div>

                    {isEdit && (
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="workshop-link">Join link</Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    id="workshop-link"
                                    readOnly
                                    value={`/w/${target.slug}`}
                                    className="font-mono text-xs"
                                />
                                <Button
                                    variant="outline"
                                    size="icon"
                                    title="Copy join link"
                                    onClick={copyJoinLink}
                                >
                                    <Link2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isPending}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={!canSubmit || isPending}>
                        {isEdit ? "Save changes" : "Create workshop"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
