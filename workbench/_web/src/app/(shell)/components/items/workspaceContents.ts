import type { LibraryItem, LibraryWorkspace, WorkspaceLibrary } from "@/types/workspaces";

/** What an empty workspace says, wherever it is shown (sidebar folder, card, workspace page). */
export const EMPTY_WORKSPACE_TEXT =
    "Start a chart or report here, or file an existing one with Move to workspace.";

/** "6 charts and 1 report", "1 chart"; empty for an empty workspace. */
export function describeContents(workspace: LibraryWorkspace): string {
    const charts = workspace.items.filter((i) => i.kind === "chart").length;
    const reports = workspace.items.length - charts;
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
