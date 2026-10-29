"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Folder, FolderPlus, GraduationCap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CreateWorkspaceDialog } from "@/components/CreateWorkspaceDialog";
import {
    useRenameWorkspace,
    useWorkspaceLibrary,
    workspaceNameError,
} from "@/lib/api/workspaceApi";
import { workspacePath } from "@/lib/chartRoutes";
import type { LibraryWorkspace } from "@/types/workspaces";
import { PageHeader, PageTitle } from "../../components/shell/PageHeader";
import { InlineNameInput } from "../../components/items/InlineNameInput";
import { formatTimestamp, formatUpdated } from "../../components/items/formatUpdated";
import { itemIcon, itemLabel } from "../../components/items/itemLabel";
import { EMPTY_WORKSPACE_TEXT, describeContents } from "../../components/items/workspaceContents";
import { WorkspaceActionsMenu } from "./WorkspaceActions";
import { inFolderOrder } from "../../components/shell/folderOrder";

/** How many of a workspace's items its card previews. */
const PREVIEW_ITEMS = 3;

/**
 * All workspaces (folders): one card each with a peek at its first items,
 * its chart and report counts and when it last changed, most recent first.
 */
export function WorkspaceGrid() {
    const { data: library, isLoading } = useWorkspaceLibrary();
    const [creating, setCreating] = useState(false);
    const workspaces = useMemo(
        () => inFolderOrder(library?.workspaces ?? []),
        [library?.workspaces],
    );

    return (
        <div className="flex size-full min-h-0 flex-col">
            <PageHeader
                start={
                    <div className="flex items-baseline gap-2">
                        <PageTitle>Workspaces</PageTitle>
                        {library && workspaces.length > 0 && (
                            <span className="text-sm tabular-nums text-muted-foreground">
                                {workspaces.length}
                            </span>
                        )}
                    </div>
                }
                end={
                    <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
                        <FolderPlus />
                        New workspace
                    </Button>
                }
            />
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
                {isLoading ? (
                    <div aria-hidden className={GRID}>
                        {Array.from({ length: 4 }, (_, i) => (
                            <WorkspaceCardSkeleton key={i} />
                        ))}
                    </div>
                ) : workspaces.length === 0 ? (
                    <EmptyWorkspaces onCreate={() => setCreating(true)} />
                ) : (
                    <ul className={GRID}>
                        {workspaces.map((workspace) => (
                            <li key={workspace.id}>
                                <WorkspaceCard
                                    workspace={workspace}
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

const CARD = "rounded border bg-secondary/80 dark:bg-secondary/50 transition-colors duration-100";

function WorkspaceCard({
    workspace,
    nameError,
}: {
    workspace: LibraryWorkspace;
    /** Why a new name can't be used (another workspace has it), or null. */
    nameError: (name: string) => string | null;
}) {
    const [renaming, setRenaming] = useState(false);
    const { mutate: rename } = useRenameWorkspace();
    const contents = describeContents(workspace);
    const preview = workspace.items.slice(0, PREVIEW_ITEMS);
    const more = workspace.items.length - preview.length;
    const FolderIcon = workspace.isWorkshop ? GraduationCap : Folder;

    return (
        <div
            className={`${CARD} group/card relative flex h-full flex-col hover:border-foreground/20 hover:bg-secondary dark:hover:bg-secondary/70`}
        >
            <div className="flex items-center gap-2 py-2.5 pl-4 pr-2">
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

            <ul className="flex min-h-[4.5rem] flex-1 flex-col gap-1 border-t px-4 py-3">
                {preview.length === 0 ? (
                    <li className="text-xs text-muted-foreground">{EMPTY_WORKSPACE_TEXT}</li>
                ) : (
                    preview.map((item) => {
                        const Icon = itemIcon(item);
                        const label = itemLabel(item);
                        return (
                            <li
                                key={`${item.kind}-${item.id}`}
                                className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"
                            >
                                <Icon className="size-3.5 shrink-0" />
                                <span className="truncate" title={label.text}>
                                    {label.text}
                                </span>
                            </li>
                        );
                    })
                )}
                {more > 0 && (
                    <li className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span aria-hidden className="size-3.5 shrink-0" />
                        {more} more
                    </li>
                )}
            </ul>

            <div className="flex items-center gap-3 border-t px-4 py-2 text-xs text-muted-foreground">
                {contents && <span className="min-w-0 truncate tabular-nums">{contents}</span>}
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
            <div className="flex h-12 items-center gap-2 px-4">
                <div className="size-4 rounded-sm bg-border animate-pulse" />
                <div className="h-3 w-1/2 rounded-sm bg-border animate-pulse" />
            </div>
            <div className="flex flex-col gap-2 border-t px-4 py-3.5">
                <div className="h-2.5 w-3/4 rounded-sm bg-border animate-pulse" />
                <div className="h-2.5 w-2/3 rounded-sm bg-border animate-pulse" />
                <div className="h-2.5 w-1/2 rounded-sm bg-border animate-pulse" />
            </div>
            <div className="h-8 border-t" />
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
