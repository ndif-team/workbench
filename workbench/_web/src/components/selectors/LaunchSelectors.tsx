"use client";

import { Layers, Plus } from "lucide-react";

import { PillPopover, type PillPopoverOption } from "@/components/ui/pill-popover";
import { cn } from "@/lib/utils";
import type { getWorkspaces } from "@/lib/queries/workspaceQueries";

/**
 * Tool + workspace pickers used to launch a chart. Shared between the landing
 * page and the cold-model Deploy dialog so the selection flow is identical in
 * both places — both produce a tool name and a workspace id ("new" for a
 * fresh workspace) that feed the same `/workbench?...` chart-creation route.
 */

export type WorkspaceListItem = Awaited<ReturnType<typeof getWorkspaces>>[number];

/** The tool values the chart-creation flow understands. */
export const TOOL_OPTIONS: PillPopoverOption[] = [
    { value: "Logit Lens", label: "Logit Lens", group: "Tools" },
    { value: "Activation Patching", label: "Activation Patching", group: "Tools" },
];

/** Inline-pill trigger chrome shared by every launch selector so they render
 * at identical height. Brand-gradient wash, full-round, visible focus ring.
 * This is the landing-page look. */
export const PILL_TRIGGER =
    "inline-flex items-center h-8 w-fit text-[11px] bg-gradient-to-r from-primary/5 to-purple-500/5 border border-primary/10 hover:from-primary/10 hover:to-purple-500/10 hover:border-primary/20 transition-all gap-1 rounded-full px-2.5 disabled:opacity-50 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background";

/** Neutral trigger that mirrors the shadcn `SelectTrigger` — `rounded-md`,
 * `border-input`, no gradient. For surfaces (dialogs) where the brand-gradient
 * pill is too loud; keeps the PillPopover behavior, just calmer chrome. */
export const NEUTRAL_PILL_TRIGGER =
    "inline-flex items-center h-8 w-fit gap-1.5 text-sm bg-transparent dark:bg-input/30 border border-input rounded-md px-3 shadow-xs transition-colors hover:bg-accent dark:hover:bg-input/50 disabled:opacity-50 disabled:cursor-not-allowed outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

export function ToolPill({
    value,
    onChange,
    disabled,
    triggerClassName = PILL_TRIGGER,
    compact = true,
    modal = false,
}: {
    value: string;
    onChange: (v: string) => void;
    disabled: boolean;
    triggerClassName?: string;
    /** `false` = neutral menu shell (shadcn vibe); `true` = brand landing look. */
    compact?: boolean;
    /** Set when used inside a Dialog so the menu list can scroll. */
    modal?: boolean;
}) {
    return (
        <PillPopover
            value={value}
            onChange={onChange}
            disabled={disabled}
            ariaLabel="Select tool"
            triggerClassName={triggerClassName}
            compact={compact}
            modal={modal}
            trigger={<span className="truncate">{value}</span>}
            showSearch={false}
            options={TOOL_OPTIONS}
        />
    );
}

export function WorkspacePill({
    value,
    onChange,
    disabled,
    workspaces,
    triggerClassName = PILL_TRIGGER,
    compact = true,
    modal = false,
}: {
    value: string;
    onChange: (v: string) => void;
    disabled: boolean;
    workspaces: WorkspaceListItem[];
    triggerClassName?: string;
    /** `false` = neutral menu shell (shadcn vibe); `true` = brand landing look. */
    compact?: boolean;
    /** Set when used inside a Dialog so the menu list can scroll. */
    modal?: boolean;
}) {
    const currentLabel =
        value === "new"
            ? "New Workspace"
            : workspaces.find((ws) => ws.id === value)?.name ?? "Workspace";

    const options: PillPopoverOption[] = [
        { value: "new", label: "New Workspace", icon: <Plus />, tone: "primary" },
        ...workspaces.map((ws) => ({
            value: ws.id,
            label: ws.name,
            group: "Workspaces",
        })),
    ];

    return (
        <PillPopover
            value={value}
            onChange={onChange}
            disabled={disabled}
            ariaLabel="Select workspace"
            triggerClassName={cn(triggerClassName, "max-w-[180px]")}
            compact={compact}
            modal={modal}
            trigger={
                <span className="inline-flex items-center gap-1.5 min-w-0">
                    <Layers className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{currentLabel}</span>
                </span>
            }
            options={options}
        />
    );
}
