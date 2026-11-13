import type { LibraryItem, LibraryWorkspace, WorkspaceLibrary } from "@/types/workspaces";

/** What an empty workspace says in the sidebar's folder and on its page. */
export const EMPTY_WORKSPACE_TEXT =
    "Start a chart, chat or report here, or file an existing one with Move to workspace.";

/** How many charts, chats and reports a workspace holds. */
export function countContents(workspace: LibraryWorkspace): {
    charts: number;
    chats: number;
    reports: number;
} {
    const count = (kind: LibraryItem["kind"]) =>
        workspace.items.filter((i) => i.kind === kind).length;
    return { charts: count("chart"), chats: count("chat"), reports: count("report") };
}

/** "6 charts, 2 chats and 1 report", "1 chart"; empty for an empty workspace. */
export function describeContents(workspace: LibraryWorkspace): string {
    const { charts, chats, reports } = countContents(workspace);
    const parts = [
        charts > 0 && `${charts} chart${charts === 1 ? "" : "s"}`,
        chats > 0 && `${chats} chat${chats === 1 ? "" : "s"}`,
        reports > 0 && `${reports} report${reports === 1 ? "" : "s"}`,
    ].filter((part): part is string => !!part);
    return parts.length > 1
        ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
        : (parts[0] ?? "");
}

/**
 * Where to go after deleting `item` while it is on screen: the next item in
 * the list it was shown in (its folder in saved order, or the default
 * workspace's items newest first), else the one before it; null when it was
 * the only one.
 */
export function neighborInList(library: WorkspaceLibrary, item: LibraryItem): LibraryItem | null {
    const list =
        library.workspaces.find((w) => w.id === item.workspaceId)?.items ?? library.defaultItems;
    const index = list.findIndex((i) => i.kind === item.kind && i.id === item.id);
    if (index === -1) return null;
    return list[index + 1] ?? list[index - 1] ?? null;
}
