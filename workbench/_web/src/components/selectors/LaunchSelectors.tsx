"use client";

import { Folder } from "lucide-react";

import { toolMeta } from "@/app/(shell)/components/toolMeta";
import { buttonVariants } from "@/components/ui/button";
import { PillPopover, type PillPopoverOption } from "@/components/ui/pill-popover";
import { cn } from "@/lib/utils";
import type { getUserWorkspaces } from "@/lib/queries/workspaceQueries";
import { toolTypeFromDisplay } from "@/lib/toolSupport";

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

/** A launch tool's icon, by its display name. */
function ToolIcon({ tool }: { tool: string }) {
    const meta = toolMeta(toolTypeFromDisplay(tool));
    return meta ? <meta.Icon className="size-4 shrink-0 text-muted-foreground" /> : null;
}

/** The tool values the chart-creation flow understands. */
const TOOL_OPTIONS: PillPopoverOption[] = [
    { value: "Logit Lens", label: "Logit Lens", group: "Tools" },
    { value: "J-Lens", label: "J-Lens", group: "Tools", trailing: <NewBadge /> },
    { value: "Activation Patching", label: "Activation Patching", group: "Tools" },
].map((option) => ({ ...option, icon: <ToolIcon tool={option.value} /> }));

/** Trigger chrome of the launch selectors on the composer: an outline button,
 * like the app's other menu buttons ("New chart"), narrower on a phone so the
 * composer's toolbar fits in two rows. */
export const LAUNCH_TRIGGER = cn(
    buttonVariants({ variant: "outline", size: "sm" }),
    "max-w-[10rem] sm:max-w-[16rem]",
);

/** Neutral trigger that mirrors the shadcn `SelectTrigger` — `rounded-md`,
 * `border-input`, no gradient. For surfaces (dialogs) where the brand-gradient
 * pill is too loud; keeps the PillPopover behavior, just calmer chrome. */
export const NEUTRAL_PILL_TRIGGER =
    "inline-flex items-center h-8 w-fit gap-1.5 text-sm bg-transparent dark:bg-input/30 border border-input rounded-md px-3 shadow-xs transition-colors hover:bg-accent dark:hover:bg-input/50 disabled:opacity-50 disabled:cursor-not-allowed outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

export function ToolPill({
    value,
    onChange,
    disabled,
    triggerClassName = LAUNCH_TRIGGER,
    modal = false,
}: {
    value: string;
    onChange: (v: string) => void;
    disabled: boolean;
    triggerClassName?: string;
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
            compact={false}
            modal={modal}
            trigger={
                <>
                    <ToolIcon tool={value} />
                    <span className="truncate">{value}</span>
                </>
            }
            showSearch={false}
            options={TOOL_OPTIONS}
        />
    );
}

/**
 * Workspace picker: "No workspace" (value "", the default workspace) or one of
 * `workspaces`. With `quietDefault`, the pill shows only its icon until a
 * folder is picked, for surfaces with no label beside it (the composer).
 */
export function WorkspacePill({
    value,
    onChange,
    disabled,
    workspaces,
    triggerClassName = LAUNCH_TRIGGER,
    modal = false,
    quietDefault = false,
}: {
    value: string;
    onChange: (v: string) => void;
    disabled: boolean;
    workspaces: WorkspaceListItem[];
    triggerClassName?: string;
    /** Set when used inside a Dialog so the menu list can scroll. */
    modal?: boolean;
    quietDefault?: boolean;
}) {
    // The menu needs a non-empty value for its "No workspace" row.
    const noWorkspace = "default";
    const folderName = value ? workspaces.find((ws) => ws.id === value)?.name : undefined;
    const currentLabel = folderName ?? (quietDefault ? null : "No workspace");

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
            compact={false}
            modal={modal}
            trigger={
                <>
                    <Folder className="size-4 shrink-0 text-muted-foreground" />
                    {currentLabel && <span className="truncate">{currentLabel}</span>}
                </>
            }
            options={options}
        />
    );
}
