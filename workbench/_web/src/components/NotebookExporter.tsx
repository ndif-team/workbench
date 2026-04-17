"use client";

import { useState, useCallback } from "react";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { generateNotebook } from "@/actions/notebook";

interface NotebookExporterProps {
    configType: string;
    configData: Record<string, unknown>;
    chartData?: Record<string, unknown> | null;
    chartName?: string;
    workspaceName?: string;
    displayMode?: string;
    darkMode?: boolean;
}

export function NotebookExporter({
    configType,
    configData,
    chartData,
    chartName,
    workspaceName,
    displayMode,
    darkMode,
}: NotebookExporterProps) {
    const [isDownloading, setIsDownloading] = useState(false);

    const handleExport = useCallback(async () => {
        setIsDownloading(true);
        try {
            const notebookJson = await generateNotebook({
                configType,
                configData,
                chartData: chartData ?? null,
                workspaceName,
                chartName,
                displayMode,
                darkMode,
            });

            const safeName = (chartName ?? configType)
                .replace(/[^a-z0-9_\- ]/gi, "_")
                .trim();

            const blob = new Blob([notebookJson], {
                type: "application/x-ipynb+json;charset=utf-8",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${safeName}.ipynb`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Failed to generate notebook:", err);
            toast.error("Failed to export notebook.");
        } finally {
            setIsDownloading(false);
        }
    }, [configType, configData, chartData, workspaceName, chartName, displayMode, darkMode]);

    return (
        <Button
            size="sm"
            className="h-8"
            variant="outline"
            onClick={handleExport}
            disabled={isDownloading}
        >
            {isDownloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
                <ArrowUpRight className="h-4 w-4" />
            )}{" "}
            Export
        </Button>
    );
}
