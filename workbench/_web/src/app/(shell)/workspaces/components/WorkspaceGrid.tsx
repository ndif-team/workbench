"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
    ChartColumn,
    ChevronRight,
    FileText,
    Folder,
    FolderPlus,
    GraduationCap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SearchInput, useSearchShortcut } from "@/components/ui/search-input";
import { CreateWorkspaceDialog } from "@/components/CreateWorkspaceDialog";
import {
    useRenameWorkspace,
    useWorkspaceLibrary,
    workspaceNameError,
} from "@/lib/api/workspaceApi";
import { workspacePath } from "@/lib/chartRoutes";
import { cn } from "@/lib/utils";
import type { LibraryItem, LibraryWorkspace } from "@/types/workspaces";
import { PageHeader, PageTitle } from "../../components/shell/PageHeader";
import { InlineNameInput } from "../../components/items/InlineNameInput";
import { formatTimestamp, formatUpdated } from "../../components/items/formatUpdated";
import { folderCover } from "../../components/items/covers";
import { itemIcon, itemLabel, itemPath } from "../../components/items/itemLabel";
import { countContents, describeContents } from "../../components/items/workspaceContents";
import { WorkspaceActionsMenu } from "../../components/items/WorkspaceActions";
import { inFolderOrder } from "../../components/shell/folderOrder";
import { searchWorkspaces } from "./workspaceSearch";

/**
 * All workspaces (folders), most recent first: one card each with the
 * folder's cover, its chart and report counts and when it last changed. The
 * search box keeps the folders whose name, or one of whose charts or
 * reports, holds the query; a card found by its items unfolds to those.
 */
export function WorkspaceGrid() {
    const { data: library, isLoading } = useWorkspaceLibrary();
    const [creating, setCreating] = useState(false);
    const [query, setQuery] = useState("");
    const searchRef = useRef<HTMLInputElement>(null);
    useSearchShortcut(
        searchRef,
        useCallback(() => setQuery(""), []),
    );
    const workspaces = useMemo(
        () => inFolderOrder(library?.workspaces ?? []),
        [library?.workspaces],
    );
    const matches = useMemo(() => searchWorkspaces(workspaces, query), [workspaces, query]);
    const searching = query.trim() !== "";
    const search = (props: { className: string; ref?: typeof searchRef }) =>
        workspaces.length > 0 && (
            <SearchInput
                {...props}
                value={query}
                onValueChange={setQuery}
                placeholder="search workspaces and charts…"
                aria-label="Search workspaces, charts and reports"
            />
        );

    return (
        <div className="flex size-full min-h-0 flex-col">
            <PageHeader
                start={
                    <div className="flex items-baseline gap-2">
                        <PageTitle>Workspaces</PageTitle>
                        {library && workspaces.length > 0 && (
                            <span className="text-sm tabular-nums text-muted-foreground">
                                {searching
                                    ? `${matches.length} of ${workspaces.length}`
                                    : workspaces.length}
                            </span>
                        )}
                    </div>
                }
                end={
                    <div className="flex items-center gap-2">
                        {search({ ref: searchRef, className: "w-56 max-sm:hidden" })}
                        <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
                            <FolderPlus />
                            New workspace
                        </Button>
                    </div>
                }
            />
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
                {search({ className: "mb-3 sm:hidden" })}
                {isLoading ? (
                    <div aria-hidden className={GRID}>
                        {Array.from({ length: 4 }, (_, i) => (
                            <WorkspaceCardSkeleton key={i} />
                        ))}
                    </div>
                ) : workspaces.length === 0 ? (
                    <EmptyWorkspaces onCreate={() => setCreating(true)} />
                ) : matches.length === 0 ? (
                    <NoMatches query={query.trim()} onClear={() => setQuery("")} />
                ) : (
                    <ul className={GRID}>
                        {matches.map(({ workspace, items }) => (
                            <li key={workspace.id}>
                                <WorkspaceCard
                                    workspace={workspace}
                                    query={query}
                                    matches={items}
                                    nameError={(name) =>
                                        workspaceNameError(library, name, workspace.id)
                                    }
                                />
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <CreateWorkspaceDialog open={creating} onOpenChange={setCreating} />
        </div>
    );
}

const GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4";

const CARD =
    "overflow-hidden rounded border bg-secondary/80 dark:bg-secondary/50 transition-colors duration-100";

/**
 * A workspace's card: its cover (a color of its own in the NDIF palette,
 * marked with how many charts and reports it holds), then its name and
 * actions, then its counts, which unfold its items in the cover's place,
 * scrolling there when they don't fit, so the card keeps its size. The whole
 * card opens the workspace. While a search found some of its items, it starts
 * unfolded and lists only those.
 */
function WorkspaceCard({
    workspace,
    query,
    matches,
    nameError,
}: {
    workspace: LibraryWorkspace;
    /** The search on the page, as typed. */
    query: string;
    /** Its items the search found; empty without a search or when only its name matched. */
    matches: LibraryItem[];
    /** Why a new name can't be used (another workspace has it), or null. */
    nameError: (name: string) => string | null;
}) {
    const [renaming, setRenaming] = useState(false);
    /** The fold the user picked, kept for the search it was picked under. */
    const [toggled, setToggled] = useState<{ query: string; open: boolean } | null>(null);
    const open = toggled?.query === query ? toggled.open : matches.length > 0;
    const listed = matches.length > 0 ? matches : workspace.items;
    const listId = useId();
    const { mutate: rename } = useRenameWorkspace();
    const contents = describeContents(workspace);
    const { charts, reports } = countContents(workspace);
    const FolderIcon = workspace.isWorkshop ? GraduationCap : Folder;

    return (
        <div
            className={`${CARD} group/card relative flex flex-col hover:border-foreground/20 hover:bg-secondary dark:hover:bg-secondary/70`}
        >
            <div className="relative aspect-[4/1] overflow-hidden border-b">
                <div
                    aria-hidden
                    className="powder-cover h-full dark:brightness-75"
                    style={folderCover(workspace.id)}
                />
                {!open && (
                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 flex items-center justify-center gap-5 text-sm font-medium tabular-nums text-white"
                    >
                        {charts > 0 && (
                            <span className="flex items-center gap-1.5">
                                <ChartColumn className="size-5" />
                                {charts}
                            </span>
                        )}
                        {reports > 0 && (
                            <span className="flex items-center gap-1.5">
                                <FileText className="size-5" />
                                {reports}
                            </span>
                        )}
                    </div>
                )}
                {open && (
                    <ul
                        id={listId}
                        className="absolute inset-x-0 bottom-0 top-1.5 z-10 flex flex-col overflow-y-auto overscroll-contain bg-secondary/90 p-1.5 animate-in fade-in-0"
                    >
                        {listed.map((item) => {
                            const Icon = itemIcon(item);
                            const label = itemLabel(item);
                            return (
                                <li key={`${item.kind}-${item.id}`}>
                                    <Link
                                        href={itemPath(item)}
                                        title={label.text}
                                        className="flex min-w-0 items-center gap-2 rounded-sm px-1.5 py-1 text-xs text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                    >
                                        <Icon className="size-3.5 shrink-0" />
                                        <span className="truncate">{label.text}</span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
            <div className="flex h-11 items-center gap-2 pb-1 pl-3 pr-1.5 pt-2">
                <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                {renaming ? (
                    <InlineNameInput
                        initialValue={workspace.name}
                        ariaLabel="Workspace name"
                        validate={nameError}
                        className="h-7 min-w-0 flex-1 px-2 text-sm font-medium"
                        onDone={(name) => {
                            setRenaming(false);
                            if (name && name !== workspace.name) {
                                rename({ workspaceId: workspace.id, name });
                            }
                        }}
                    />
                ) : (
                    <Link
                        href={workspacePath(workspace.id)}
                        title={workspace.name}
                        className="min-w-0 flex-1 truncate text-sm font-medium outline-none after:absolute after:inset-0 after:rounded focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
                    >
                        {workspace.name}
                    </Link>
                )}
                {!workspace.isWorkshop && (
                    <div className="relative z-10 shrink-0">
                        <WorkspaceActionsMenu
                            workspace={workspace}
                            onRename={() => setRenaming(true)}
                        />
                    </div>
                )}
            </div>

            <div className="flex items-center gap-3 pb-2 pl-1.5 pr-3 text-xs text-muted-foreground">
                {contents ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setToggled({ query, open: !open })}
                        aria-expanded={open}
                        aria-controls={open ? listId : undefined}
                        title={open ? "Hide items" : "Show items"}
                        className="relative z-10 h-6 min-w-0 gap-1 px-1.5 text-xs font-normal tabular-nums text-muted-foreground hover:text-foreground has-[>svg]:px-1.5"
                    >
                        <ChevronRight
                            className={cn("size-3.5 transition-transform", open && "rotate-90")}
                        />
                        <span className="truncate">
                            {matches.length > 0
                                ? `${matches.length} of ${workspace.items.length} match${matches.length === 1 ? "es" : ""}`
                                : contents}
                        </span>
                    </Button>
                ) : (
                    <span className="flex h-6 items-center pl-1.5">Empty</span>
                )}
                <span
                    className="ml-auto shrink-0 whitespace-nowrap"
                    title={formatTimestamp(workspace.updatedAt)}
                >
                    Updated {formatUpdated(workspace.updatedAt)}
                </span>
            </div>
        </div>
    );
}

function WorkspaceCardSkeleton() {
    return (
        <div className={`${CARD} flex flex-col`}>
            <div className="aspect-[4/1] animate-pulse border-b bg-secondary" />
            <div className="flex h-10 items-center gap-2 px-3">
                <div className="size-4 rounded-sm bg-border animate-pulse" />
                <div className="h-3 w-1/2 rounded-sm bg-border animate-pulse" />
            </div>
            <div className="px-3 pb-3">
                <div className="h-2.5 w-1/3 rounded-sm bg-border animate-pulse" />
            </div>
        </div>
    );
}

function NoMatches({ query, onClear }: { query: string; onClear: () => void }) {
    return (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="break-words text-sm text-muted-foreground">
                No workspace, chart or report matches &ldquo;{query}&rdquo;.
            </p>
            <Button variant="outline" size="sm" onClick={onClear}>
                Clear search
            </Button>
        </div>
    );
}

function EmptyWorkspaces({ onCreate }: { onCreate: () => void }) {
    return (
        <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex size-12 items-center justify-center rounded border bg-secondary/80 dark:bg-secondary/50">
                <Folder className="size-5 text-muted-foreground" />
            </div>
            <div className="flex max-w-sm flex-col gap-1">
                <h2 className="text-sm font-medium">Group related charts and reports</h2>
                <p className="text-sm text-muted-foreground">
                    A workspace is a project folder. Create one, then file charts in it with Move to
                    workspace from a chart&apos;s menu.
                </p>
            </div>
            <Button variant="outline" size="sm" onClick={onCreate}>
                <FolderPlus />
                New workspace
            </Button>
        </div>
    );
}
