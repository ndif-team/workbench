import type { ComponentProps } from "react";
import { ArrowUp, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RunButtonProps extends Omit<ComponentProps<typeof Button>, "children" | "size"> {
    /** A run is under way: the arrow gives way to a spinner. */
    busy?: boolean;
}

/**
 * The composers' Run (Home's and the phone's): an arrow on a square of the
 * tools' accent, as tall as the pickers beside it. It is grey while there is
 * nothing to run and keeps its color while a run is under way.
 */
export function RunButton({ busy = false, className, ...props }: RunButtonProps) {
    return (
        <Button
            variant="tool"
            size="icon"
            className={cn(
                "group/run shadow-sm shadow-tool-accent/40",
                "hover:shadow-md hover:shadow-tool-accent/40 active:scale-95",
                busy
                    ? "disabled:opacity-100"
                    : "disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none",
                className,
            )}
            {...props}
        >
            {busy ? (
                <Loader2 className="animate-spin" />
            ) : (
                <ArrowUp
                    strokeWidth={2.5}
                    className="transition-transform duration-200 group-hover/run:-translate-y-0.5"
                />
            )}
        </Button>
    );
}
