import type { ComponentType } from "react";
import { FileText, FileQuestion } from "lucide-react";

import type { LibraryItem } from "@/types/workspaces";
import { chartPath, reportPath } from "@/lib/chartRoutes";
import { toolMeta } from "../toolMeta";

/** The name a chart is stored with until it is renamed. */
const DEFAULT_CHART_NAME = "Untitled Chart";

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
 * How an item reads in lists. A chart shows its name, else the first line of
 * its prompt (most charts are never renamed), else "Untitled chart". A report
 * shows the title derived from its first line.
 */
export function itemLabel(item: LibraryItem): ItemLabel {
    if (item.kind === "report") {
        return item.title
            ? { text: item.title, placeholder: false }
            : { text: "Untitled report", placeholder: true };
    }
    const name = chartName(item.name);
    if (name) return { text: name, placeholder: false };
    const prompt = item.prompt?.split("\n")[0].trim();
    if (prompt) return { text: prompt, placeholder: false };
    return { text: "Untitled chart", placeholder: true };
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
