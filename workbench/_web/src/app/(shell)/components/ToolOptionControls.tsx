import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ToolOptions } from "@/lib/toolOptions";
import type { ToolOption, ToolOptionValues } from "@/types/models";
import { ToolOptionSwitch } from "./ToolOptionSwitch";

interface ToolOptionControlsProps {
    /** The options the tool takes on the selected model (`ToolOptions.of`). */
    options: ToolOption[];
    /** The value each is at (`ToolOptions.values`). */
    values: ToolOptionValues | undefined;
    onPick: (name: string, value: string) => void;
    disabled: boolean;
    /** On a touch screen nothing explains itself on hover: the controls come
     *  without tooltips, a switch as wide as its container, and the caller
     *  puts `ToolOptionNotes` under them. */
    touch?: boolean;
    /** Where the controls are a detail beside the main action (Home's
     *  composer, next to Run), an on/off option is a quiet text toggle that
     *  tints when on, as the patch tools' toggles do, instead of a check. */
    quiet?: boolean;
}

/**
 * A control for each option a tool's model offers, to sit in the tool's
 * Controls among its own: a check for an option that is on or off (a text
 * toggle where `quiet`), a row of segments for one with several values. Each
 * explains itself in a tooltip.
 * Renders nothing for a model that offers no option.
 */
export function ToolOptionControls({
    options,
    values,
    onPick,
    disabled,
    touch = false,
    quiet = false,
}: ToolOptionControlsProps) {
    const OnOff = quiet ? ToolOptionToggle : ToolOptionCheck;
    return (
        <>
            {options.map((option) => {
                const value = values?.[option.name] ?? option.default;
                const pick = (picked: string) => onPick(option.name, picked);
                return ToolOptions.isToggle(option) ? (
                    <OnOff
                        key={option.name}
                        option={option}
                        value={value}
                        onChange={pick}
                        disabled={disabled}
                        touch={touch}
                    />
                ) : (
                    <ToolOptionSwitch
                        key={option.name}
                        id={ToolOptionControls.idOf(option)}
                        name={option.label}
                        choices={option.choices}
                        value={value}
                        onChange={pick}
                        disabled={disabled}
                        touch={touch}
                    />
                );
            })}
        </>
    );
}

/** The DOM id of an option's control. */
ToolOptionControls.idOf = (option: ToolOption) => `tool-option-${option.name}`;

interface ToolOptionOnOffProps {
    option: ToolOption;
    value: string;
    onChange: (value: string) => void;
    disabled: boolean;
    touch: boolean;
}

/** An on/off option as a quiet text toggle, named after what it is when on. */
function ToolOptionToggle({ option, value, onChange, disabled, touch }: ToolOptionOnOffProps) {
    const on = ToolOptions.on(option);
    const pressed = value === on.value;

    const toggle = (
        <Button
            id={ToolOptionControls.idOf(option)}
            type="button"
            variant="ghost"
            size="control"
            aria-pressed={pressed}
            disabled={disabled}
            onClick={() => onChange(pressed ? option.default : on.value)}
            className="px-2 text-xs font-normal text-muted-foreground aria-pressed:bg-tool-accent/15 aria-pressed:text-tool-accent"
        >
            {on.label}
        </Button>
    );

    if (touch) return toggle;

    return (
        <Tooltip disableHoverableContent>
            <TooltipTrigger asChild>{toggle}</TooltipTrigger>
            <TooltipContent side="bottom" align="end" className="max-w-64 text-pretty">
                {on.description}
            </TooltipContent>
        </Tooltip>
    );
}

/** An on/off option as a check, named after what it is when on. */
function ToolOptionCheck({ option, value, onChange, disabled, touch }: ToolOptionOnOffProps) {
    const on = ToolOptions.on(option);
    const id = ToolOptionControls.idOf(option);

    const check = (
        <div className="flex items-center gap-2">
            <Checkbox
                id={id}
                checked={value === on.value}
                onCheckedChange={(checked) =>
                    onChange(checked === true ? on.value : option.default)
                }
                disabled={disabled}
                className="border-tool-accent focus-visible:ring-tool-accent data-[state=checked]:bg-tool-accent data-[state=checked]:text-tool-accent-foreground"
            />
            <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
                {on.label}
            </Label>
        </div>
    );

    if (touch) return check;

    return (
        <Tooltip disableHoverableContent>
            <TooltipTrigger asChild>{check}</TooltipTrigger>
            <TooltipContent side="bottom" align="end" className="max-w-64 text-pretty">
                {on.description}
            </TooltipContent>
        </Tooltip>
    );
}

interface ToolOptionNotesProps {
    options: ToolOption[];
    values: ToolOptionValues | undefined;
}

/**
 * What each option does, written out for a touch screen, where
 * `ToolOptionControls` has no tooltips: an on/off option's own description
 * under its name, and for one with several values the picked value's.
 */
export function ToolOptionNotes({ options, values }: ToolOptionNotesProps) {
    return (
        <>
            {options.map((option) => {
                const toggle = ToolOptions.isToggle(option);
                const choice = toggle
                    ? ToolOptions.on(option)
                    : ToolOptions.choice(option, values?.[option.name]);
                return (
                    <p
                        key={option.name}
                        aria-live="polite"
                        className="text-pretty text-xs text-muted-foreground max-md:text-sm"
                    >
                        {toggle && <span className="font-medium">{choice?.label}. </span>}
                        {choice?.description}
                    </p>
                );
            })}
        </>
    );
}
