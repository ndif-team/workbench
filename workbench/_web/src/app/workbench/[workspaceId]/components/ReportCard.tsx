"use client";

import { useParams } from "next/navigation";
import { FileText, MoreVertical, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DocumentListItem } from "@/lib/queries/documentQueries";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

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
      className={cn("flex items-center border h-24 rounded", isSelected && "border-primary")}
      onClick={onClick}
      draggable={false}
    >
      <div
        className={cn(
          "relative w-[35%] h-24 overflow-hidden rounded-l text-muted-foreground border-y border-r flex flex-col bg-background items-center justify-center",
          isSelected && "border-primary",
        )}
      >
        <FileText className="h-5 w-5" />
        <span className="text-xs font-medium capitalize">Report</span>
      </div>
      <div
        key={report.id}
        className={cn(
          "p-3 cursor-pointer transition-all h-full w-[65%]",
          isSelected ? "bg-primary/5" : "hover:bg-muted/50",
        )}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <span className="text-sm font-medium truncate max-w-36">
                {report.derivedTitle || "Untitled"}
              </span>
            </div>
            <div className="text-xs text-muted-foreground break-words flex items-center gap-3">
              {updatedAt && <span className="text-xs text-muted-foreground">{updatedAt}</span>}
            </div>
          </div>
          <Popover>
            <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-1" align="end">
              <button
                className="flex w-full items-center gap-3 px-3 py-2.5 text-sm hover:bg-accent rounded-sm text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete</span>
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}
