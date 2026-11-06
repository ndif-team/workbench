/**
 * The workspace a chart or report page renders in, looked up server-side from
 * the item in the URL (see `WorkspaceScopeProvider`).
 */
export type WorkspaceScope = {
    workspaceId: string;
    /** The workspace's name as of the page load (prefer the library's for anything renameable). */
    name: string;
    /** Set when the workspace belongs to a workshop (tool/model restrictions, guided tutorial). */
    workshopId: string | null;
    /** The workshop's tutorial; null outside a workshop, or when it runs the seeded demo. */
    tutorialId: string | null;
    /** The user's default workspace: never shown as a folder, renamed or deleted. */
    isDefault: boolean;
};

/** What a workspace holds: charts and reports. */
export type WorkspaceItemKind = "chart" | "report";

export type LibraryChartItem = {
    kind: "chart";
    id: string;
    workspaceId: string;
    name: string;
    /** The chart's tool under its current name (config type, else chart type).
     * A retired tool's type passes through, so route it with `chartPath`. */
    toolType: string | null;
    /** The model saved on the chart's config. */
    model: string | null;
    /** The chart's prompt (the source prompt of two-prompt tools), if any; labels unnamed charts. */
    prompt: string | null;
    /** Whether the chart has a saved result. */
    hasData: boolean;
    position: number;
    createdAt: Date;
    updatedAt: Date;
};

export type LibraryReportItem = {
    kind: "report";
    id: string;
    workspaceId: string;
    /** Derived from the report's first line (`deriveReportTitle`); empty when blank. */
    title: string;
    position: number;
    createdAt: Date;
    updatedAt: Date;
};

export type LibraryItem = LibraryChartItem | LibraryReportItem;

export type LibraryWorkspace = {
    id: string;
    name: string;
    /** Workshop workspaces can't be move sources or targets. */
    isWorkshop: boolean;
    createdAt: Date;
    updatedAt: Date;
    /** Charts and reports in position order. */
    items: LibraryItem[];
};

/** Everything the global sidebar lists for one user, in one round trip. */
export type WorkspaceLibrary = {
    /** Null only for a workshop participant, who has no default workspace. */
    defaultWorkspaceId: string | null;
    /** The default workspace's charts and reports, most recently updated first. */
    defaultItems: LibraryItem[];
    /** Every other workspace (folder), most recently updated first. */
    workspaces: LibraryWorkspace[];
};
