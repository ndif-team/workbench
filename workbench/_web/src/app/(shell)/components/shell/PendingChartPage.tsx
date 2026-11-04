"use client";

import { ChevronRight } from "lucide-react";

import { useWorkspaceLibrary } from "@/lib/api/workspaceApi";
import { launchTool, type ChartLaunchRequest } from "@/lib/chartLaunch";
import { cn } from "@/lib/utils";
import type { ToolType } from "@/types/charts";
import { toolMeta } from "../toolMeta";
import { PageHeader } from "./PageHeader";

type PromptField = { label: string; placeholder: string; height: string };

/** Each tool page's empty controls: their share of the width (the controls
 *  panel's `defaultSize`) and their prompt fields. */
const LAYOUTS: Record<ToolType, { controls: number; fields: PromptField[] }> = {
    "logit-lens": {
        controls: 25,
        fields: [{ label: "Prompt", placeholder: "Enter your prompt here...", height: "min-h-32" }],
    },
    jlens: {
        controls: 25,
        fields: [{ label: "Prompt", placeholder: "Enter your prompt here...", height: "min-h-32" }],
    },
    "activation-patching": {
        controls: 30,
        fields: [
            { label: "Source Prompt", placeholder: "Enter source prompt...", height: "min-h-24" },
            { label: "Target Prompt", placeholder: "Enter target prompt...", height: "min-h-24" },
        ],
    },
    "patch-lens": { controls: 27, fields: [] },
};

/**
 * The page of a chart that is being created, shown from the moment it's asked
 * for until the chart's own page opens (`usePendingChart`, and `/new`): the
 * chart page's header and its tool's empty panels, laid out as that page lays
 * them out and holding the prompts it was launched with, so the page fills in
 * around them rather than replacing a spinner.
 */
export function PendingChartPage({ request }: { request: ChartLaunchRequest }) {
    const tool = launchTool(request.tool);
    const layout = LAYOUTS[tool];
    const { data: library } = useWorkspaceLibrary({ enabled: !!request.workspaceId });
    const folderName = library?.workspaces.find((w) => w.id === request.workspaceId)?.name;
    const prompts =
        request.deploy === "true"
            ? []
            : tool === "activation-patching"
              ? [request.srcPrompt, request.tgtPrompt]
              : [request.prompt];

    return (
        <div className="flex size-full min-h-0 flex-col" aria-busy="true">
            <span role="status" className="sr-only">
                Creating chart…
            </span>
            <PageHeader
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
                        <span className="min-w-0 truncate px-1 font-medium text-muted-foreground">
                            Untitled chart
                        </span>
                    </div>
                }
            />
            <div className="min-h-0 flex-1 px-3 pb-3 max-md:px-2 max-md:pb-2">
                <div
                    aria-hidden
                    className="flex size-full rounded border bg-secondary/80 dark:bg-secondary/50"
                >
                    <div
                        className="flex flex-col border-r max-md:hidden"
                        style={{ width: `${layout.controls}%` }}
                    >
                        <div className="flex items-center border-b p-3">
                            <h2 className="pl-2 text-sm font-medium">{toolMeta(tool)?.label}</h2>
                        </div>
                        <div className="flex flex-col gap-4 p-3">
                            {layout.fields.map((field, i) => (
                                <div key={field.label} className="flex flex-col gap-2">
                                    <span className="text-sm font-medium">{field.label}</span>
                                    <div
                                        className={cn(
                                            "w-full whitespace-pre-wrap break-words rounded-md border border-input bg-input/30 px-3 py-2 text-sm leading-5 shadow-xs",
                                            field.height,
                                            !prompts[i] && "text-muted-foreground",
                                        )}
                                    >
                                        {prompts[i] || field.placeholder}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="min-w-0 flex-1 px-3 pt-3">
                        <div className="size-full rounded border border-dashed" />
                    </div>
                </div>
            </div>
        </div>
    );
}
