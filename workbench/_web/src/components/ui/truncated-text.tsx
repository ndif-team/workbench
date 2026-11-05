"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

/**
 * One line of text that ends in "…" when it doesn't fit, with the whole text
 * in a tooltip on hover while it is cut off (and none when it fits). Whether
 * it is cut off is checked as the tooltip opens, so it follows the space the
 * text has at that moment.
 */
function TruncatedText({
    children,
    className,
    side = "bottom",
}: {
    children: string;
    className?: string;
    side?: React.ComponentProps<typeof TooltipContent>["side"];
}) {
    const ref = React.useRef<HTMLSpanElement>(null);
    const [open, setOpen] = React.useState(false);
    const cutOff = () => !!ref.current && ref.current.scrollWidth > ref.current.clientWidth;

    return (
        <Tooltip open={open} onOpenChange={(next) => setOpen(next && cutOff())}>
            <TooltipTrigger asChild>
                <span ref={ref} className={cn("truncate", className)}>
                    {children}
                </span>
            </TooltipTrigger>
            <TooltipContent side={side} className="max-w-sm break-words">
                {children}
            </TooltipContent>
        </Tooltip>
    );
}

export { TruncatedText };
