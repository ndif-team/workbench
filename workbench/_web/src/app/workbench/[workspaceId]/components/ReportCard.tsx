"use client";

import { useParams } from "next/navigation";
import { FileText, MoreVertical, Trash2 } from "lucide-react";
import type { DocumentListItem } from "@/lib/queries/documentQueries";
import { sidebarCardShell } from "./sidebarCardShell";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function ReportCard({
    report,
    onClick,
    onDelete,
}: {
    report: DocumentListItem;
    onClick: () => void;
    onDelete: (e: React.MouseEvent) => void;
}) {
    const { overviewId } = useParams<{ overviewId?: string }>();
    const isSelected = overviewId === report.id;
    const updatedAt = report.updatedAt
        ? new Date(report.updatedAt as unknown as string).toLocaleDateString("en-US", {
              month: "numeric",
              day: "numeric",
          })
        : "";

    return (
        <div
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
            className={sidebarCardShell({ selected: isSelected })}
            onClick={onClick}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onClick();
                }
            }}
        >
            {/* line 1: title + overflow menu */}
            <div className="flex items-center justify-between gap-2">
                <span
                    className={
                        isSelected
                            ? "truncate text-sm font-semibold leading-tight text-foreground"
                            : "truncate text-sm font-medium leading-tight text-foreground"
                    }
                >
                    {report.derivedTitle || "Untitled"}
                </span>

                <Popover>
                    <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <button
                            type="button"
                            aria-label="Report actions"
                            className="-m-0.5 shrink-0 rounded p-0.5 text-muted-foreground/40 transition-colors hover:bg-accent hover:text-foreground focus-visible:text-foreground group-hover:text-muted-foreground"
                        >
                            <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-40 p-1" align="end">
                        <button
                            className="flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-sm text-destructive hover:bg-accent"
                            onClick={onDelete}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Delete</span>
                        </button>
                    </PopoverContent>
                </Popover>
            </div>

            {/* line 2: kind (left) · date (right) */}
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="flex min-w-0 items-center gap-1.5 truncate">
                    <FileText className="h-3 w-3 shrink-0 opacity-80" />
                    <span className="truncate">Report</span>
                </span>
                {updatedAt && <span className="shrink-0 tabular-nums">{updatedAt}</span>}
            </div>
        </div>
    );
}
