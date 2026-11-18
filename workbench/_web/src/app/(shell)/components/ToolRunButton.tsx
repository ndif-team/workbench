import type { ComponentProps } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ToolType } from "@/types/charts";
import { toolMeta } from "./toolMeta";

interface ToolRunButtonProps extends Omit<ComponentProps<typeof Button>, "children" | "variant"> {
    /** The tool it runs, whose icon it carries. */
    tool: ToolType;
    /** A run is under way: the label gives way to "Computing...". */
    busy: boolean;
}

/**
 * A tool's side-panel Run: the tool's icon and "Run", as wide as the panel, in
 * the tools' accent. The composers' icon-only Run is `RunButton`.
 */
export function ToolRunButton({ tool, busy, className, ...props }: ToolRunButtonProps) {
    const Icon = toolMeta(tool)?.Icon;
    return (
        <Button variant="tool" className={cn("w-full", className)} {...props}>
            {busy ? <Loader2 className="animate-spin" /> : Icon && <Icon />}
            {busy ? "Computing..." : "Run"}
        </Button>
    );
}
