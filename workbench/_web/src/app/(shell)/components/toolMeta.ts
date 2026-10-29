import type { ComponentType } from "react";
import { GitBranch, Grid3X3 } from "lucide-react";
import { JLensIcon } from "@/components/JLensIcon";
import { PatchLensIcon } from "@/components/PatchLensIcon";
import { normalizeToolType, toolTypes, type ToolType } from "@/types/charts";

type ToolMeta = {
    label: string;
    /** Compact label for narrow places such as sidebar cards; defaults to `label`. */
    shortLabel?: string;
    Icon: ComponentType<{ className?: string }>;
};

const TOOL_META: Record<ToolType, ToolMeta> = {
    "logit-lens": { label: "Logit Lens", Icon: Grid3X3 },
    jlens: { label: "J-Lens", Icon: JLensIcon },
    "activation-patching": {
        label: "Activation Patching",
        shortLabel: "Act. Patching",
        Icon: GitBranch,
    },
    "patch-lens": { label: "Patch Lens", Icon: PatchLensIcon },
};

/**
 * Display label and icon of a chart's tool. Pass the chart's tool (its config
 * type), falling back to its stored chart type, which stays null until the
 * chart first runs. Retired or unknown types return undefined, so callers
 * render their own fallback.
 */
export function toolMeta(type: string | null | undefined): ToolMeta | undefined {
    const tool = normalizeToolType(type);
    return (toolTypes as readonly (string | null | undefined)[]).includes(tool)
        ? TOOL_META[tool as ToolType]
        : undefined;
}
