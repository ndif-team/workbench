"use client";

import { PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface CollapsedRailButtonProps {
    onExpand: () => void;
    count: number;
    className?: string;
}

export function CollapsedRailButton({ onExpand, count, className }: CollapsedRailButtonProps) {
    return (
        <div className={cn("flex h-full w-9 flex-col items-center border-l py-2", className)}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-foreground"
                        onClick={onExpand}
                        aria-label="Expand text generation panel"
                    >
                        <PanelRightOpen className="size-3.5" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs">
                    Text generation
                </TooltipContent>
            </Tooltip>
            <button
                type="button"
                onClick={onExpand}
                aria-label="Expand text generation panel"
                className="mt-2 flex flex-1 items-center justify-center"
            >
                <span
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                    style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                >
                    Generation
                    {count > 0 ? ` · ${count}` : ""}
                </span>
            </button>
        </div>
    );
}
