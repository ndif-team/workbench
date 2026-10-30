"use client";

import { Layers } from "lucide-react";

import { PillPopover, type PillPopoverOption } from "@/components/ui/pill-popover";
import { cn } from "@/lib/utils";
import type { getUserWorkspaces } from "@/lib/queries/workspaceQueries";

/**
 * Tool + workspace pickers used to launch a chart. Shared between the landing
 * page and the cold-model Deploy dialog so the selection flow is identical in
 * both places — both produce a tool name and a workspace id ("" for no
 * workspace, i.e. the default one) that feed the same `/new?...` chart-creation
 * route.
 */

type WorkspaceListItem = Awaited<ReturnType<typeof getUserWorkspaces>>[number];

/** "New" badge marking a recently added tool in the picker. */
const NewBadge = () => (
    <span className="shrink-0 rounded-full bg-purple-500/15 px-1.5 py-0.5 text-xs font-medium leading-none text-purple-600 dark:text-purple-400">
        New
    </span>
);

/** The tool values the chart-creation flow understands. */
const TOOL_OPTIONS: PillPopoverOption[] = [
    { value: "Logit Lens", label: "Logit Lens", group: "Tools" },
    { value: "J-Lens", label: "J-Lens", group: "Tools", trailing: <NewBadge /> },
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

/** Workspace picker: "No workspace" (value "", the default workspace) or one of `workspaces`. */
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
    workspaces: Pick<WorkspaceListItem, "id" | "name">[];
    triggerClassName?: string;
    /** `false` = neutral menu shell (shadcn vibe); `true` = brand landing look. */
    compact?: boolean;
    /** Set when used inside a Dialog so the menu list can scroll. */
    modal?: boolean;
}) {
    // The menu needs a non-empty value for its "No workspace" row.
    const noWorkspace = "default";
    const currentLabel =
        (value && workspaces.find((ws) => ws.id === value)?.name) || "No workspace";

    const options: PillPopoverOption[] = [
        { value: noWorkspace, label: "No workspace" },
        ...workspaces.map((ws) => ({
            value: ws.id,
            label: ws.name,
            group: "Workspaces",
        })),
    ];

    return (
        <PillPopover
            value={value || noWorkspace}
            onChange={(v) => onChange(v === noWorkspace ? "" : v)}
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
