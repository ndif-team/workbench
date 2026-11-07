"use client";

import { useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, MessageSquare } from "lucide-react";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspaceScope } from "@/components/providers/WorkspaceScopeProvider";
import { useLaunchChart } from "@/hooks/useLaunchChart";
import { useStartChat } from "@/hooks/useStartChat";
import { useCreateDocument } from "@/lib/api/documentApi";
import type { ChartOrigin } from "@/lib/chartLaunch";
import { reportPath } from "@/lib/chartRoutes";
import { toolTypes, type ToolType } from "@/types/charts";
import { cn } from "@/lib/utils";
import { toolMeta } from "../toolMeta";

interface NewItemMenuProps {
    /** The menu's trigger (rendered `asChild`). */
    children: ReactNode;
    /** Folder to create a chart or chat in; the default workspace when omitted. */
    workspaceId?: string;
    /** Offers New chat; leave unset for a workshop workspace, which holds no chats. */
    offerChat?: boolean;
    /** Workspace a new report goes in; leave unset to offer no Report entry. */
    reportWorkspaceId?: string;
    /** Limits the tools offered (a workshop's allowed tools). */
    tools?: readonly ToolType[];
    /** The surface the menu is on, reported as a new chart's `origin`. */
    origin?: ChartOrigin;
    side?: "bottom" | "right";
    align?: "start" | "end";
    contentClassName?: string;
}

/**
 * Where the sidebar's New chart, New chat and New report file what they
 * create: the folder of the item on screen, else the default workspace
 * (`defaultWorkspaceId`, which a report is created in by id).
 */
export function useNewItemWorkspace(defaultWorkspaceId: string | undefined) {
    const scope = useWorkspaceScope();
    const folderId = scope && !scope.isDefault ? scope.workspaceId : undefined;
    return {
        workspaceId: folderId,
        reportWorkspaceId: folderId ?? defaultWorkspaceId,
        offerChat: !scope?.workshopId,
    };
}

/**
 * "New chart": the four tools, then New chat when `offerChat` is set and New
 * report when `reportWorkspaceId` is. A chart is launched in place
 * (`useLaunchChart`: its page shows at once, then opens with its prompt
 * focused); a chat or report is created here and opened. Picking any of them
 * keeps focus from returning to the trigger, so it can land on the page being
 * opened.
 */
export function NewItemMenu({
    children,
    workspaceId,
    offerChat = false,
    reportWorkspaceId,
    tools = toolTypes,
    origin = "sidebar",
    side = "bottom",
    align = "start",
    contentClassName,
}: NewItemMenuProps) {
    const router = useRouter();
    const createReport = useCreateDocument(
        origin === "workspace_page" ? "workspace_page" : "sidebar",
    );
    const launchChart = useLaunchChart();
    const { start: startChat, isPending: startingChat } = useStartChat();
    const pickedRef = useRef(false);

    const newChart = (tool: ToolType) => {
        pickedRef.current = true;
        launchChart(workspaceId ? { tool, workspaceId } : { tool }, origin);
    };

    const newChat = () => {
        pickedRef.current = true;
        startChat(workspaceId).catch(() => undefined);
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
                {(offerChat || reportWorkspaceId) && <DropdownMenuSeparator />}
                {offerChat && (
                    <DropdownMenuItem onSelect={newChat} disabled={startingChat}>
                        <MessageSquare className="text-muted-foreground" />
                        New chat
                    </DropdownMenuItem>
                )}
                {reportWorkspaceId && (
                    <DropdownMenuItem onSelect={newReport} disabled={createReport.isPending}>
                        <FileText className="text-muted-foreground" />
                        New report
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
