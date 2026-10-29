"use client";

import type { ReactNode } from "react";
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
 * "New chart": the four tools, plus Report when `reportWorkspaceId` is set.
 * A chart is created by `/new` (which files it and opens it); a report is
 * created here and opened.
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

    const newChart = (tool: ToolType) => {
        capture("chart_created", { tool });
        router.push(newChartPath(workspaceId ? { tool, workspaceId } : { tool }));
    };

    const newReport = () => {
        if (!reportWorkspaceId) return;
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
            <DropdownMenuContent side={side} align={align} className={cn("w-56", contentClassName)}>
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
                            Report
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
