"use client";

import { useState } from "react";
import { ArrowUpRight, ChevronDown, FileCode, ImageDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { snapshotChart } from "nnsightful";

import { generateNotebook } from "@/actions/notebook";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { chartFigure, chartPrompt } from "@/lib/report/chartFigure";
import { chartLabel } from "./items/itemLabel";
import { toolMeta } from "./toolMeta";

type ChartRow = { name?: string | null; type?: string | null; data?: unknown };
type ConfigRow = { type?: string | null; data?: unknown };

/** A chart's exports, and saving them as files. */
class ChartExport {
    /** Layout width of an image, CSS px; the logit lens samples its layer
     *  columns to fit it, as on screen. */
    static readonly WIDTH = 960;
    /** Activation patching's height; the lenses take their content height. */
    static readonly HEIGHT = 480;
    /** Pixel density, so the image stays sharp when zoomed into. */
    static readonly SCALE = 2;
    /** Tools with a notebook template (`src/notebook-templates`). */
    static readonly NOTEBOOK_TOOLS = new Set(["activation-patching"]);

    /** The chart as a PNG: its saved view in the current theme, drawn as a
     *  report draws it, without the logit lens's layer navigator. */
    static async image(chart: ChartRow, config: ConfigRow | null | undefined, darkMode: boolean) {
        const figure = chartFigure(chart, config);
        if (figure.gap) throw new Error(`Chart can't be drawn: ${figure.gap}`);
        const shot = await snapshotChart(figure.spec, {
            width: ChartExport.WIDTH,
            height: ChartExport.HEIGHT,
            scale: ChartExport.SCALE,
            darkMode,
            layerNavigator: false,
        });
        return shot.toBlob();
    }

    /** A Jupyter notebook that reruns the chart, with its result embedded. */
    static async notebook(chart: ChartRow, config: ConfigRow, workspaceName?: string) {
        const notebookJson = await generateNotebook({
            configType: config.type ?? "",
            configData: (config.data ?? {}) as Record<string, unknown>,
            chartData: (chart.data ?? null) as Record<string, unknown> | null,
            chartName: chart.name ?? undefined,
            workspaceName,
        });
        return new Blob([notebookJson], { type: "application/x-ipynb+json;charset=utf-8" });
    }

    /** The file name a chart is saved as: its label as the sidebar shows
     *  it, else its tool's name, made safe for a file system. */
    static fileName(chart: ChartRow, config: ConfigRow | null | undefined, extension: string) {
        const label = chartLabel({ name: chart.name, prompt: chartPrompt(chart, config) });
        const stem = label.placeholder
            ? (toolMeta(config?.type ?? chart.type)?.label ?? "chart")
            : label.text;
        const safe =
            stem
                .replace(/[^a-z0-9_\- ]/gi, "_")
                .trim()
                .slice(0, 80) || "chart";
        return `${safe}.${extension}`;
    }

    static save(blob: Blob, fileName: string) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Revoking synchronously after click() can invalidate the URL before
        // the browser has read it for the download.
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }
}

interface ChartExportMenuProps {
    /** The chart's row, as its page queries it. */
    chart: ChartRow;
    /** Its config's row, which holds its view and its run's parameters. */
    config: ConfigRow | null | undefined;
    darkMode: boolean;
    /** Named in an exported notebook. */
    workspaceName?: string;
}

/**
 * A chart page's Export menu: the chart as an image, and for a tool with a
 * notebook template, a Jupyter notebook.
 */
export function ChartExportMenu({ chart, config, darkMode, workspaceName }: ChartExportMenuProps) {
    const [exporting, setExporting] = useState(false);
    const notebookConfig =
        config && ChartExport.NOTEBOOK_TOOLS.has(config.type ?? "") ? config : null;

    const run = async (make: () => Promise<Blob>, extension: string, what: string) => {
        setExporting(true);
        try {
            ChartExport.save(await make(), ChartExport.fileName(chart, config, extension));
        } catch (error) {
            console.error(`Failed to export the ${what}:`, error);
            toast.error(`Failed to export the ${what}.`);
        } finally {
            setExporting(false);
        }
    };

    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
                <Button size="sm" className="h-8" variant="outline" disabled={exporting}>
                    {exporting ? <Loader2 className="animate-spin" /> : <ArrowUpRight />}
                    {exporting ? "Exporting…" : "Export"}
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem
                    onSelect={() =>
                        run(() => ChartExport.image(chart, config, darkMode), "png", "image")
                    }
                >
                    <ImageDown className="text-muted-foreground" />
                    Image (.png)
                </DropdownMenuItem>
                {notebookConfig && (
                    <DropdownMenuItem
                        onSelect={() =>
                            run(
                                () => ChartExport.notebook(chart, notebookConfig, workspaceName),
                                "ipynb",
                                "notebook",
                            )
                        }
                    >
                        <FileCode className="text-muted-foreground" />
                        Jupyter notebook (.ipynb)
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
