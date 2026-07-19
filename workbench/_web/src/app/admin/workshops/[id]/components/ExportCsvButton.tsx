"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { exportWorkshopCsv } from "@/lib/queries/workshopAnalyticsQueries";

/** Fetches the CSV from the admin-guarded server action and downloads it client-side. */
export function ExportCsvButton({
    workshopId,
    workshopName,
}: {
    workshopId: string;
    workshopName: string;
}) {
    const [busy, setBusy] = useState(false);

    const download = async () => {
        setBusy(true);
        try {
            const csv = await exportWorkshopCsv(workshopId);
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            const safeName = workshopName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
            a.href = url;
            a.download = `workshop-${safeName || workshopId}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            toast.error("Could not export CSV");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Button variant="outline" size="sm" onClick={download} disabled={busy}>
            <Download className="h-4 w-4" />
            {busy ? "Exporting…" : "Export CSV"}
        </Button>
    );
}
