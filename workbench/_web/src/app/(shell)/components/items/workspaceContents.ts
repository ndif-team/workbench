import type { LibraryItem, LibraryWorkspace, WorkspaceLibrary } from "@/types/workspaces";

/** What an empty workspace says in the sidebar's folder and on its page. */
export const EMPTY_WORKSPACE_TEXT =
    "Start a chart or report here, or file an existing one with Move to workspace.";

/** How many charts and reports a workspace holds. */
export function countContents(workspace: LibraryWorkspace): { charts: number; reports: number } {
    const charts = workspace.items.filter((i) => i.kind === "chart").length;
    return { charts, reports: workspace.items.length - charts };
}

/** "6 charts and 1 report", "1 chart"; empty for an empty workspace. */
export function describeContents(workspace: LibraryWorkspace): string {
    const { charts, reports } = countContents(workspace);
    return [
        charts > 0 && `${charts} chart${charts === 1 ? "" : "s"}`,
        reports > 0 && `${reports} report${reports === 1 ? "" : "s"}`,
    ]
        .filter(Boolean)
        .join(" and ");
}

/**
 * Where to go after deleting `item` while it is on screen: the next item in
 * the list it was shown in (its folder in saved order, or the unfiled charts
 * newest first), else the one before it; null when it was the only one.
 */
export function neighborInList(library: WorkspaceLibrary, item: LibraryItem): LibraryItem | null {
    const list =
        library.workspaces.find((w) => w.id === item.workspaceId)?.items ?? library.defaultItems;
    const index = list.findIndex((i) => i.kind === item.kind && i.id === item.id);
    if (index === -1) return null;
    return list[index + 1] ?? list[index - 1] ?? null;
}
