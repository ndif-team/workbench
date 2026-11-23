"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { useWorkspaceLibrary } from "@/lib/api/workspaceApi";
import { cn } from "@/lib/utils";
import { PageHeader } from "./PageHeader";

/**
 * The header of an item that is being created (`PendingChartPage`,
 * `PendingChatPage`), as its page's header will show it: `start` (the model
 * picker), then the breadcrumb, the folder it goes in (none for the default
 * workspace) and its name, muted while it is a `placeholder`.
 */
export function PendingItemHeader({
    start,
    workspaceId,
    title,
    placeholder,
}: {
    start?: ReactNode;
    workspaceId?: string;
    title: string;
    placeholder: boolean;
}) {
    const { data: library } = useWorkspaceLibrary({ enabled: !!workspaceId });
    const folderName = library?.workspaces.find((w) => w.id === workspaceId)?.name;

    return (
        <PageHeader
            start={start}
            center={
                <div className="flex min-w-0 items-center gap-1 text-sm">
                    {folderName && (
                        <>
                            <span className="hidden min-w-0 max-w-[12rem] truncate px-1 text-muted-foreground md:block">
                                {folderName}
                            </span>
                            <ChevronRight
                                aria-hidden
                                className="hidden size-3.5 shrink-0 text-muted-foreground md:block"
                            />
                        </>
                    )}
                    <span
                        className={cn(
                            "min-w-0 truncate px-1 font-medium",
                            placeholder && "text-muted-foreground",
                        )}
                    >
                        {title}
                    </span>
                </div>
            }
        />
    );
}
