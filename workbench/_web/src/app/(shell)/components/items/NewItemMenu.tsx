"use client";

import { useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText } from "lucide-react";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspaceScope } from "@/components/providers/WorkspaceScopeProvider";
import { useCreateDocument } from "@/lib/api/documentApi";
import { useCapture } from "@/lib/analytics";
import { newChartPath, reportPath } from "@/lib/chartRoutes";
import { toolTypes, type ToolType } from "@/types/charts";
import { cn } from "@/lib/utils";
import { toolMeta } from "../toolMeta";

interface NewItemMenuProps {
    /** The menu's trigger (rendered `asChild`). */
    children: ReactNode;
    /** Folder to create in; the default workspace when omitted. */
    workspaceId?: string;
    /** Workspace a new report goes in; leave unset to offer no Report entry. */
    reportWorkspaceId?: string;
    /** Limits the tools offered (a workshop's allowed tools). */
    tools?: readonly ToolType[];
    side?: "bottom" | "right";
    align?: "start" | "end";
    contentClassName?: string;
}

/**
 * Where the sidebar's New chart and New report file what they create: the
 * folder of the chart or report on screen, else the default workspace
 * (`defaultWorkspaceId`, which a report is created in by id).
 */
export function useNewItemWorkspace(defaultWorkspaceId: string | undefined) {
    const scope = useWorkspaceScope();
    const folderId = scope && !scope.isDefault ? scope.workspaceId : undefined;
    return { workspaceId: folderId, reportWorkspaceId: folderId ?? defaultWorkspaceId };
}

/**
 * "New chart": the four tools, plus New report when `reportWorkspaceId` is
 * set. A chart is created by `/new` (which files it and opens it, its prompt
 * focused); a report is created here and opened. Picking either keeps focus
 * from returning to the trigger, so it can land on the page being opened.
 */
export function NewItemMenu({
    children,
    workspaceId,
    reportWorkspaceId,
    tools = toolTypes,
    side = "bottom",
    align = "start",
    contentClassName,
}: NewItemMenuProps) {
    const router = useRouter();
    const capture = useCapture();
    const createReport = useCreateDocument();
    const pickedRef = useRef(false);

    const newChart = (tool: ToolType) => {
        pickedRef.current = true;
        capture("chart_created", { tool });
        router.push(newChartPath(workspaceId ? { tool, workspaceId } : { tool }));
    };

    const newReport = () => {
        if (!reportWorkspaceId) return;
        pickedRef.current = true;
        createReport.mutate(reportWorkspaceId, {
            onSuccess: (report) => {
                router.push(reportPath(report.id));
            },
            onError: () => toast.error("Couldn't create the report"),
        });
    };

    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
            <DropdownMenuContent
                side={side}
                align={align}
                className={cn("w-56", contentClassName)}
                onCloseAutoFocus={(e) => {
                    if (!pickedRef.current) return;
                    pickedRef.current = false;
                    e.preventDefault();
                }}
            >
                {tools.map((tool) => {
                    const meta = toolMeta(tool);
                    if (!meta) return null;
                    return (
                        <DropdownMenuItem key={tool} onSelect={() => newChart(tool)}>
                            <meta.Icon className="text-muted-foreground" />
                            {meta.label}
                        </DropdownMenuItem>
                    );
                })}
                {reportWorkspaceId && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={newReport} disabled={createReport.isPending}>
                            <FileText className="text-muted-foreground" />
                            New report
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
