"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useWorkshops, useDeleteWorkshop } from "@/lib/api/workshopApi";
import type { WorkshopWithCount } from "@/lib/queries/workshopDb";
import { WorkshopRow } from "./WorkshopRow";
import { WorkshopFormDialog } from "./WorkshopFormDialog";

/**
 * Container for the workshop admin list: owns the list query and which
 * workshop (if any) the create/edit dialog is showing.
 */
export function WorkshopsAdmin() {
    const { data: workshops, isLoading } = useWorkshops();
    const { mutate: deleteWorkshop } = useDeleteWorkshop();

    // null = closed, "new" = create, otherwise the workshop being edited.
    const [dialogTarget, setDialogTarget] = useState<WorkshopWithCount | "new" | null>(null);

    return (
        <div className="flex flex-col gap-4 pt-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold">Workshops</h2>
                    <p className="text-sm text-muted-foreground">
                        Join links that sign participants in and limit their workspace to the
                        configured tools. Editing tools later only affects new charts.
                    </p>
                </div>
                <Button onClick={() => setDialogTarget("new")}>
                    <Plus className="w-4 h-4" />
                    New workshop
                </Button>
            </div>

            {isLoading && (
                <div className="flex items-center gap-2 rounded-md border p-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading workshops…
                </div>
            )}

            {!isLoading && (workshops?.length ?? 0) === 0 && (
                <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
                    No workshops yet. Create one to get a shareable join link.
                </div>
            )}

            <div className="flex flex-col gap-2">
                {(workshops ?? []).map((workshop) => (
                    <WorkshopRow
                        key={workshop.id}
                        workshop={workshop}
                        onEdit={() => setDialogTarget(workshop)}
                        onDelete={() => deleteWorkshop(workshop.id)}
                    />
                ))}
            </div>

            <WorkshopFormDialog target={dialogTarget} onClose={() => setDialogTarget(null)} />
        </div>
    );
}
