import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { LoopedLens } from "@/types/logitLens";

interface CodaLensCheckProps {
    value: LoopedLens;
    onChange: (lens: LoopedLens) => void;
    disabled: boolean;
    /** Where what the coda lens does is written: a tooltip over the check, or
     *  under it, for a touch screen. */
    explain?: "hover" | "inline";
}

/**
 * Turns the coda lens on for a looped model's logit lens: checked is the
 * `"coda"` lens, unchecked the plain `"logit"` one. Shown only for those
 * models: any other has no layers after a loop to run a state through.
 */
export function CodaLensCheck({ value, onChange, disabled, explain = "hover" }: CodaLensCheckProps) {
    const check = (
        <div className="flex w-fit items-center gap-2">
            <Checkbox
                id="coda-lens"
                checked={value === "coda"}
                onCheckedChange={(checked) => onChange(checked === true ? "coda" : "logit")}
                disabled={disabled}
                className="border-tool-accent focus-visible:ring-tool-accent data-[state=checked]:bg-tool-accent data-[state=checked]:text-tool-accent-foreground"
            />
            <Label htmlFor="coda-lens" className="cursor-pointer text-sm font-normal">
                Coda lens
            </Label>
        </div>
    );

    if (explain === "inline") {
        return (
            <div className="flex flex-col gap-2">
                {check}
                <p className="text-pretty text-xs text-muted-foreground">
                    {CodaLensCheck.DESCRIPTION}
                </p>
            </div>
        );
    }

    return (
        <Tooltip disableHoverableContent>
            <TooltipTrigger asChild>{check}</TooltipTrigger>
            <TooltipContent side="bottom" align="start" className="max-w-64 text-pretty">
                {CodaLensCheck.DESCRIPTION}
            </TooltipContent>
        </Tooltip>
    );
}

CodaLensCheck.DESCRIPTION =
    "Runs the model's final block, the coda, on each layer visit's state before reading it, which makes earlier visits readable. Visits inside the coda are read directly.";
