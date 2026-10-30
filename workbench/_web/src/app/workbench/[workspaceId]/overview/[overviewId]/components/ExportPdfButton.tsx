"use client";

import { useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { snapshotChart } from "nnsightful";
import { Button } from "@/components/ui/button";
import { getChartById, getConfigForChart } from "@/lib/queries/chartQueries";
import { queryKeys } from "@/lib/queryKeys";
import { chartFigure, chartFigureGapText } from "@/lib/report/chartFigure";
import {
    reportChartIds,
    reportPdfDefinition,
    reportPdfFileName,
    reportTitle,
    type ReportPdfChart,
} from "@/lib/report/reportPdf";
import { downloadPdf } from "@/lib/report/pdfmake";
import { toolMeta } from "@/app/workbench/[workspaceId]/components/toolMeta";

// Layout size of a chart snapshot, CSS px. The PDF draws it at the page's
// content width (~484 pt), so this sets how small its text comes out.
const SNAPSHOT_WIDTH = 720;
const SNAPSHOT_HEIGHT = 360; // activation patching; the lenses take their content height

/** One embedded chart as the PDF shows it: a light-theme snapshot of its
 *  saved state, or a note saying why it isn't drawn. Fetches fresh rows so
 *  the latest state is drawn. */
async function pdfChart(queryClient: QueryClient, chartId: string): Promise<ReportPdfChart> {
    let chart, config;
    try {
        [chart, config] = await Promise.all([
            queryClient.fetchQuery({
                queryKey: queryKeys.charts.chart(chartId),
                queryFn: () => getChartById(chartId),
            }),
            queryClient.fetchQuery({
                queryKey: queryKeys.charts.configByChart(chartId),
                queryFn: () => getConfigForChart(chartId),
            }),
        ]);
    } catch (error) {
        // One chart failing to load shouldn't fail the whole export.
        console.error(`Failed to load chart ${chartId}:`, error);
        return { title: "Chart", note: "This chart couldn't be loaded." };
    }
    const tool = toolMeta(config?.type ?? chart?.type);
    const model = (config?.data as { model?: string } | undefined)?.model;
    const title = chart ? chart.name || "Untitled" : "Chart";
    const subtitle = [tool?.label, model].filter(Boolean).join(" · ") || undefined;

    const figure = chartFigure(chart, config);
    if (figure.gap) return { title, subtitle, note: chartFigureGapText(figure.gap, tool?.label) };
    try {
        const shot = await snapshotChart(figure.spec, {
            width: SNAPSHOT_WIDTH,
            height: SNAPSHOT_HEIGHT,
            scale: 2,
        });
        return {
            title,
            subtitle,
            image: { dataUrl: shot.dataUrl, width: shot.width, height: shot.height },
        };
    } catch (error) {
        console.error(`Failed to snapshot chart ${chartId}:`, error);
        return { title, subtitle, note: "This chart couldn't be drawn." };
    }
}

/** Export the report as it stands in the editor (unsaved edits included) to a
 *  PDF, with each embedded chart drawn from its saved state. */
export function ExportPdfButton() {
    const [editor] = useLexicalComposerContext();
    const queryClient = useQueryClient();
    const [exporting, setExporting] = useState(false);

    const exportPdf = async () => {
        setExporting(true);
        try {
            const state = editor.getEditorState().toJSON();
            const title = reportTitle(state);
            const charts = new Map<string, ReportPdfChart>();
            // One at a time: each snapshot lays a chart out offscreen.
            for (const chartId of reportChartIds(state)) {
                charts.set(chartId, await pdfChart(queryClient, chartId));
            }
            await downloadPdf(
                reportPdfDefinition(state, { title, charts }),
                reportPdfFileName(title),
            );
        } catch (error) {
            console.error("Failed to export the report:", error);
            toast.error("Failed to export the PDF.");
        } finally {
            setExporting(false);
        }
    };

    return (
        <Button
            size="sm"
            className="h-8"
            variant="outline"
            onClick={exportPdf}
            disabled={exporting}
        >
            {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
                <FileDown className="h-4 w-4" />
            )}
            {exporting ? "Exporting…" : "Export PDF"}
        </Button>
    );
}
