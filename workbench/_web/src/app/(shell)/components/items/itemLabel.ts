import type { ComponentType } from "react";
import { FileText, FileQuestion, MessageSquare } from "lucide-react";

import { DEFAULT_CHART_NAME } from "@/types/charts";
import { DEFAULT_CHAT_NAME } from "@/types/chats";
import type { LibraryItem } from "@/types/workspaces";
import { chartPath, chatPath, reportPath } from "@/lib/chartRoutes";
import { toolMeta } from "../toolMeta";

/** A chart's own name, or "" while it still has the default one. */
export function chartName(name: string | null | undefined): string {
    const trimmed = name?.trim() ?? "";
    return trimmed === DEFAULT_CHART_NAME ? "" : trimmed;
}

export type ItemLabel = {
    text: string;
    /** True when the item has no name or prompt of its own to show; render it muted. */
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

/**
 * How an item reads in lists: a chart by `chartLabel`, a chat by its name
 * (muted while it is still "New chat", i.e. before its first message names
 * it), a report by the title derived from its first line.
 */
export function itemLabel(item: LibraryItem): ItemLabel {
    if (item.kind === "report") {
        return item.title
            ? { text: item.title, placeholder: false }
            : { text: "Untitled report", placeholder: true };
    }
    if (item.kind === "chat") {
        const name = item.name.trim();
        return name && name !== DEFAULT_CHAT_NAME
            ? { text: name, placeholder: false }
            : { text: DEFAULT_CHAT_NAME, placeholder: true };
    }
    return chartLabel(item);
}

/** How an item's name is edited in place. */
export type NameField = {
    /** What the field starts from. */
    value: string;
    ariaLabel: string;
    placeholder: string;
};

/** The in-place name field of a chart or chat; null for a report, titled by its first line. */
export function nameField(item: LibraryItem): NameField | null {
    if (item.kind === "chart") {
        return {
            value: chartName(item.name),
            ariaLabel: "Chart name",
            placeholder: "Untitled chart",
        };
    }
    if (item.kind === "chat") {
        return { value: item.name, ariaLabel: "Chat name", placeholder: DEFAULT_CHAT_NAME };
    }
    return null;
}

/** The item's icon: its tool's for a chart, else one per kind. */
export function itemIcon(item: LibraryItem): ComponentType<{ className?: string }> {
    if (item.kind === "report") return FileText;
    if (item.kind === "chat") return MessageSquare;
    return toolMeta(item.toolType)?.Icon ?? FileQuestion;
}

/** What kind of item it is, in words: a chart's tool, "Chat" or "Report". */
export function itemKindLabel(item: LibraryItem): string {
    if (item.kind === "report") return "Report";
    if (item.kind === "chat") return "Chat";
    return toolMeta(item.toolType)?.label ?? "Retired tool";
}

/** Where the item opens. */
export function itemPath(item: LibraryItem): string {
    if (item.kind === "report") return reportPath(item.id);
    if (item.kind === "chat") return chatPath(item.id);
    return chartPath(item.id, item.toolType, item.workspaceId);
}
