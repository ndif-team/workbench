import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** One value of a tool option: what it is called and what it does. */
export interface ToolOption<Value extends string> {
    value: Value;
    label: string;
    description: string;
}

interface ToolOptionSwitchProps<Value extends string> {
    /** The group's DOM id. */
    id: string;
    /** What the option is called, for assistive technology. */
    name: string;
    options: readonly ToolOption<Value>[];
    value: Value;
    onChange: (value: Value) => void;
    disabled: boolean;
    /** Where what a value does is written: a tooltip over its segment, or
     *  under the switch for the picked one, for a touch screen. */
    explain?: "hover" | "inline";
}

/**
 * A tool option with a few named values, as a row of segments in a tool's
 * controls: the picked one tinted like the patch tools' pressed toggles. With
 * `explain="inline"` the segments share the width they are given.
 */
export function ToolOptionSwitch<Value extends string>({
    id,
    name,
    options,
    value,
    onChange,
    disabled,
    explain = "hover",
}: ToolOptionSwitchProps<Value>) {
    const inline = explain === "inline";

    const segment = (option: ToolOption<Value>) => (
        <Button
            key={option.value}
            type="button"
            variant="ghost"
            aria-pressed={value === option.value}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
                "h-full rounded-sm text-xs text-muted-foreground aria-pressed:bg-tool-accent/15 aria-pressed:text-tool-accent",
                inline ? "flex-1 px-1" : "px-2",
            )}
        >
            {option.label}
        </Button>
    );

    const group = (
        <div
            id={id}
            role="group"
            aria-label={name}
            className={cn(
                "h-8 shrink-0 items-center gap-0.5 rounded-md border bg-card p-0.5 shadow-xs dark:bg-input/30 md:h-7",
                inline ? "flex w-full" : "inline-flex",
            )}
        >
            {options.map((option) =>
                inline ? (
                    segment(option)
                ) : (
                    <Tooltip key={option.value} disableHoverableContent>
                        <TooltipTrigger asChild>{segment(option)}</TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-64 text-pretty">
                            {option.description}
                        </TooltipContent>
                    </Tooltip>
                ),
            )}
        </div>
    );

    if (!inline) return group;

    return (
        <div className="flex flex-col gap-2">
            {group}
            <p aria-live="polite" className="text-pretty text-xs text-muted-foreground">
                {options.find((option) => option.value === value)?.description}
            </p>
        </div>
    );
}
