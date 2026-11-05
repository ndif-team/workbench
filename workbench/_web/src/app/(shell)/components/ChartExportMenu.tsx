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
import { normalizeTool, useCapture } from "@/lib/analytics";
import { captureError } from "@/lib/errorTracking";
import { chartFigure, chartPrompt } from "@/lib/report/chartFigure";
import { chartLabel } from "./items/itemLabel";
import { toolMeta } from "./toolMeta";

type ChartRow = { name?: string | null; type?: string | null; data?: unknown };
type ConfigRow = { type?: string | null; data?: unknown };
type ExportFormat = keyof typeof ChartExport.FORMATS;

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
    /** Each export's file extension, and how its failure names it. */
    static readonly FORMATS = {
        png: { extension: "png", what: "image" },
        notebook: { extension: "ipynb", what: "notebook" },
    } as const;

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
 * A chart page's Export menu, in its header: the chart as an image, and for
 * a tool with a notebook template, a Jupyter notebook.
 */
export function ChartExportMenu({ chart, config, darkMode, workspaceName }: ChartExportMenuProps) {
    const [exporting, setExporting] = useState(false);
    const capture = useCapture();
    const notebookConfig =
        config && ChartExport.NOTEBOOK_TOOLS.has(config.type ?? "") ? config : null;

    const run = async (format: ExportFormat, make: () => Promise<Blob>) => {
        const { extension, what } = ChartExport.FORMATS[format];
        const tool = normalizeTool(config?.type ?? chart.type);
        setExporting(true);
        try {
            ChartExport.save(await make(), ChartExport.fileName(chart, config, extension));
            capture("chart_exported", { tool, format });
        } catch (error) {
            console.error(`Failed to export the ${what}:`, error);
            captureError(error, { source: "chart_export", tool, format });
            toast.error(`Failed to export the ${what}.`);
        } finally {
            setExporting(false);
        }
    };

    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={exporting} aria-label="Export">
                    {exporting ? <Loader2 className="animate-spin" /> : <ArrowUpRight />}
                    <span className="hidden sm:inline">{exporting ? "Exporting…" : "Export"}</span>
                    <ChevronDown className="hidden size-3.5 text-muted-foreground sm:block" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem
                    onSelect={() => run("png", () => ChartExport.image(chart, config, darkMode))}
                >
                    <ImageDown className="text-muted-foreground" />
                    Image (.png)
                </DropdownMenuItem>
                {notebookConfig && (
                    <DropdownMenuItem
                        onSelect={() =>
                            run("notebook", () =>
                                ChartExport.notebook(chart, notebookConfig, workspaceName),
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
