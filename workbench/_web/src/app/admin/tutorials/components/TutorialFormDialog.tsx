"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { useCreateTutorial, useUpdateTutorial } from "@/lib/api/tutorialContentApi";
import type { Tutorial } from "@/db/schema";
import type { TutorialContent } from "@/types/tutorial-content";
import { PROLIFIC_TUTORIAL_SEED } from "@/tutorials/prolificSeed";

/**
 * Create/edit a tutorial. The unit content is edited as JSON (a structured
 * per-unit form is a follow-up) — the shape is the TutorialContent contract, and
 * the server re-validates on save. "Load demo template" fills the editor with the
 * seed so a new tutorial starts from a working example.
 */
export function TutorialFormDialog({
    target,
    onClose,
}: {
    target: Tutorial | "new" | null;
    onClose: () => void;
}) {
    const isEdit = target !== null && target !== "new";
    const { mutate: createTutorial, isPending: isCreating } = useCreateTutorial();
    const { mutate: updateTutorial, isPending: isUpdating } = useUpdateTutorial();
    const isPending = isCreating || isUpdating;

    const [name, setName] = useState("");
    const [json, setJson] = useState("");

    useEffect(() => {
        if (target === null) return;
        if (target === "new") {
            setName("");
            setJson(JSON.stringify(PROLIFIC_TUTORIAL_SEED, null, 2));
        } else {
            setName(target.name);
            setJson(JSON.stringify(target.data, null, 2));
        }
    }, [target]);

    const parseContent = (): TutorialContent | null => {
        try {
            return JSON.parse(json) as TutorialContent;
        } catch {
            toast.error("Content is not valid JSON");
            return null;
        }
    };

    const handleSubmit = () => {
        if (name.trim() === "") return;
        const data = parseContent();
        if (!data) return;
        if (isEdit) {
            updateTutorial(
                { id: target.id, updates: { name: name.trim(), data } },
                { onSuccess: () => onClose() },
            );
        } else {
            createTutorial({ name: name.trim(), data }, { onSuccess: () => onClose() });
        }
    };

    return (
        <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{isEdit ? "Edit tutorial" : "New tutorial"}</DialogTitle>
                    <DialogDescription>
                        Guided-activity content assigned to a workshop. Edit the units as JSON
                        (task, concept, prompts, hints, checks, progression).
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="tutorial-name">Name</Label>
                        <Input
                            id="tutorial-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Prolific Patch Lens — July variant"
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="tutorial-json">Content (JSON)</Label>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs"
                                onClick={() =>
                                    setJson(JSON.stringify(PROLIFIC_TUTORIAL_SEED, null, 2))
                                }
                            >
                                Load demo template
                            </Button>
                        </div>
                        <Textarea
                            id="tutorial-json"
                            value={json}
                            onChange={(e) => setJson(e.target.value)}
                            className="font-mono text-xs min-h-[360px]"
                            spellCheck={false}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isPending}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={name.trim() === "" || isPending}>
                        {isEdit ? "Save changes" : "Create tutorial"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
