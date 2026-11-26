import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ToolChoice } from "@/types/models";

interface ToolOptionSwitchProps {
    /** The group's DOM id. */
    id: string;
    /** What the option is called, for assistive technology. */
    name: string;
    choices: readonly ToolChoice[];
    value: string;
    onChange: (value: string) => void;
    disabled: boolean;
    /** On a touch screen the segments have no tooltips, share the width
     *  they are given and are a size larger; what the picked one does is
     *  written elsewhere (`ToolOptionNotes`). */
    touch?: boolean;
}

/**
 * A tool option with several named values, as a row of segments in a tool's
 * controls: the picked one tinted like the patch tools' pressed toggles, each
 * explaining its value in a tooltip.
 */
export function ToolOptionSwitch({
    id,
    name,
    choices,
    value,
    onChange,
    disabled,
    touch = false,
}: ToolOptionSwitchProps) {
    const segment = (choice: ToolChoice) => (
        <Button
            key={choice.value}
            type="button"
            variant="ghost"
            aria-pressed={value === choice.value}
            disabled={disabled}
            onClick={() => onChange(choice.value)}
            className={cn(
                "h-full rounded-sm text-muted-foreground aria-pressed:bg-tool-accent/15 aria-pressed:text-tool-accent",
                touch ? "flex-1 px-1 text-sm" : "px-2 text-xs",
            )}
        >
            {choice.label}
        </Button>
    );

    return (
        <div
            id={id}
            role="group"
            aria-label={name}
            className={cn(
                "shrink-0 items-center gap-0.5 rounded-md border bg-card p-0.5 shadow-xs dark:bg-input/30",
                touch ? "flex h-10 w-full" : "inline-flex h-8 md:h-7",
            )}
        >
            {choices.map((choice) =>
                touch ? (
                    segment(choice)
                ) : (
                    <Tooltip key={choice.value} disableHoverableContent>
                        <TooltipTrigger asChild>{segment(choice)}</TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-64 text-pretty">
                            {choice.description}
                        </TooltipContent>
                    </Tooltip>
                ),
            )}
        </div>
    );
}
