import type { ComponentType } from "react";
import { FileText, FileQuestion } from "lucide-react";

import { DEFAULT_CHART_NAME } from "@/types/charts";
import type { LibraryItem } from "@/types/workspaces";
import { chartPath, reportPath } from "@/lib/chartRoutes";
import { toolMeta } from "../toolMeta";

/** A chart's own name, or "" while it still has the default one. */
export function chartName(name: string | null | undefined): string {
    const trimmed = name?.trim() ?? "";
    return trimmed === DEFAULT_CHART_NAME ? "" : trimmed;
}

export type ItemLabel = {
    text: string;
    /** True when the item has neither a name nor a prompt to show; render it muted. */
    placeholder: boolean;
};

/**
 * How a chart reads wherever it is listed or embedded: its name, else the
 * first line of its prompt (most charts are never renamed), else "Untitled
 * chart".
 */
export function chartLabel({
    name,
    prompt,
}: {
    name: string | null | undefined;
    prompt: string | null | undefined;
}): ItemLabel {
    const own = chartName(name);
    if (own) return { text: own, placeholder: false };
    const firstLine = prompt?.split("\n")[0].trim();
    if (firstLine) return { text: firstLine, placeholder: false };
    return { text: "Untitled chart", placeholder: true };
}

/** How an item reads in lists: a chart by `chartLabel`, a report by the title derived from its first line. */
export function itemLabel(item: LibraryItem): ItemLabel {
    if (item.kind === "report") {
        return item.title
            ? { text: item.title, placeholder: false }
            : { text: "Untitled report", placeholder: true };
    }
    return chartLabel(item);
}

/** The item's tool icon (a report icon for reports). */
export function itemIcon(item: LibraryItem): ComponentType<{ className?: string }> {
    if (item.kind === "report") return FileText;
    return toolMeta(item.toolType)?.Icon ?? FileQuestion;
}

/** Where the item opens. */
export function itemPath(item: LibraryItem): string {
    return item.kind === "report"
        ? reportPath(item.id)
        : chartPath(item.id, item.toolType, item.workspaceId);
}
