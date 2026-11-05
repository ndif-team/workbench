import type { LibraryWorkspace } from "@/types/workspaces";

/**
 * Folders in display order: the user's own folders first, workshop
 * workspaces after them, each group keeping the library's newest-first order.
 */
export function inFolderOrder(workspaces: readonly LibraryWorkspace[]): LibraryWorkspace[] {
    return [...workspaces].sort((a, b) => Number(a.isWorkshop) - Number(b.isWorkshop));
}

/** How many folders the sidebar lists before "Show N more". */
const SIDEBAR_FOLDER_LIMIT = 5;

/**
 * The folders the sidebar lists until "Show N more" is used: the first
 * `limit` in display order, plus the folder holding the item on screen when
 * it is further down, so the active row is never hidden.
 */
export function visibleFolders(
    folders: readonly LibraryWorkspace[],
    activeFolderId: string | null,
    limit = SIDEBAR_FOLDER_LIMIT,
): LibraryWorkspace[] {
    return folders.filter((folder, i) => i < limit || folder.id === activeFolderId);
}
