"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus, Sprout, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    useTutorials,
    useDeleteTutorial,
    useEnsureSeedTutorial,
} from "@/lib/api/tutorialContentApi";
import type { Tutorial } from "@/db/schema";
import { TutorialFormDialog } from "./TutorialFormDialog";

/**
 * Container for the tutorial admin list: owns the list query and which tutorial
 * (if any) the create/edit dialog is showing. "Seed demo" idempotently creates
 * the built-in Prolific tutorial so it can be assigned/edited.
 */
export function TutorialsAdmin() {
    const { data: tutorials, isLoading } = useTutorials();
    const { mutate: deleteTutorial } = useDeleteTutorial();
    const { mutate: seedDemo, isPending: isSeeding } = useEnsureSeedTutorial();

    const [dialogTarget, setDialogTarget] = useState<Tutorial | "new" | null>(null);

    return (
        <div className="flex flex-col gap-4 pt-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold">Tutorials</h2>
                    <p className="text-sm text-muted-foreground">
                        Guided-activity content. Assign a tutorial to a workshop in its settings;
                        workshops with none fall back to the demo tutorial.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => seedDemo()} disabled={isSeeding}>
                        <Sprout className="w-4 h-4" />
                        Seed demo
                    </Button>
                    <Button onClick={() => setDialogTarget("new")}>
                        <Plus className="w-4 h-4" />
                        New tutorial
                    </Button>
                </div>
            </div>

            {isLoading && (
                <div
                    aria-live="polite"
                    className="flex items-center gap-2 rounded-md border p-4 text-sm text-muted-foreground"
                >
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading tutorials…
                </div>
            )}

            {!isLoading && (tutorials?.length ?? 0) === 0 && (
                <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
                    No tutorials yet. Seed the demo or create one.
                </div>
            )}

            <div className="flex flex-col gap-2">
                {(tutorials ?? []).map((t) => (
                    <div
                        key={t.id}
                        className="flex items-center justify-between rounded-md border bg-card p-3 shadow-xs"
                    >
                        <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{t.name}</p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                                {t.data.units.length} units · {t.slug}
                            </p>
                        </div>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                title="Edit tutorial"
                                onClick={() => setDialogTarget(t)}
                            >
                                <Pencil className="h-4 w-4" />
                            </Button>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        title="Delete tutorial"
                                        className="text-muted-foreground hover:text-destructive"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent align="end" className="w-64">
                                    <p className="text-sm">
                                        Delete “{t.name}”? Workshops using it fall back to the demo
                                        tutorial.
                                    </p>
                                    <div className="mt-3 flex justify-end">
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => deleteTutorial(t.id)}
                                        >
                                            Delete
                                        </Button>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                ))}
            </div>

            <TutorialFormDialog target={dialogTarget} onClose={() => setDialogTarget(null)} />
        </div>
    );
}
