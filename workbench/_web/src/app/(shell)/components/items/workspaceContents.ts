import type { LibraryWorkspace } from "@/types/workspaces";

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
