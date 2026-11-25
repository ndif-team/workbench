import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { LoopedLens } from "@/types/logitLens";

interface CodaLensCheckProps {
    value: LoopedLens;
    onChange: (lens: LoopedLens) => void;
    disabled: boolean;
    /** "hover" explains the coda lens in a tooltip over the check; "inline"
     *  leaves it to the caller, for a touch screen (`DESCRIPTION`). */
    explain?: "hover" | "inline";
}

/**
 * Turns the coda lens on for a looped model's logit lens: checked is the
 * `"coda"` lens, unchecked the plain `"logit"` one. It sits on the entropy
 * check's line (`LensParams`' children), and only for those models: any other
 * has no layers after a loop to run a state through.
 */
export function CodaLensCheck({ value, onChange, disabled, explain = "hover" }: CodaLensCheckProps) {
    const check = (
        <div className="flex items-center gap-2">
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

    if (explain === "inline") return check;

    return (
        <Tooltip disableHoverableContent>
            <TooltipTrigger asChild>{check}</TooltipTrigger>
            <TooltipContent side="bottom" align="end" className="max-w-64 text-pretty">
                {CodaLensCheck.DESCRIPTION}
            </TooltipContent>
        </Tooltip>
    );
}

CodaLensCheck.DESCRIPTION =
    "Runs the model's final block, the coda, on each layer visit's state before reading it, which makes earlier visits readable. Visits inside the coda are read directly.";
