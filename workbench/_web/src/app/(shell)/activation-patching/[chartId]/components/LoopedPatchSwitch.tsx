import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { LoopedPatch } from "@/types/activationPatching";

interface LoopedPatchSwitchProps {
    value: LoopedPatch;
    onChange: (patch: LoopedPatch) => void;
    disabled: boolean;
    /** Where what a patch does is written: a tooltip over its segment, or under
     * the switch for the picked one, for a touch screen. */
    explain?: "hover" | "inline";
}

/**
 * Switches what a patch replaces at a layer visit of a looped model: two
 * segments, the picked one tinted like the patch tools' pressed toggles. Shown
 * only for those models: any other keeps one tensor per token, so its patching
 * has nothing to choose between.
 */
export function LoopedPatchSwitch({
    value,
    onChange,
    disabled,
    explain = "hover",
}: LoopedPatchSwitchProps) {
    const picked = LoopedPatchSwitch.OPTIONS.find((option) => option.value === value);

    const segment = (option: (typeof LoopedPatchSwitch.OPTIONS)[number]) => (
        <Button
            key={option.value}
            type="button"
            variant="ghost"
            aria-pressed={value === option.value}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className="h-full rounded-sm px-2 text-xs text-muted-foreground aria-pressed:bg-tool-accent/15 aria-pressed:text-tool-accent"
        >
            {option.label}
        </Button>
    );

    const group = (
        <div
            id="looped-patch"
            role="group"
            aria-label="Patch"
            className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-md border bg-card p-0.5 shadow-xs dark:bg-input/30 md:h-7"
        >
            {LoopedPatchSwitch.OPTIONS.map((option) =>
                explain === "hover" ? (
                    <Tooltip key={option.value} disableHoverableContent>
                        <TooltipTrigger asChild>{segment(option)}</TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-64 text-pretty">
                            {option.description}
                        </TooltipContent>
                    </Tooltip>
                ) : (
                    segment(option)
                ),
            )}
        </div>
    );

    if (explain === "hover") return group;

    return (
        <div className="flex flex-col items-start gap-2">
            {group}
            <p aria-live="polite" className="text-pretty text-xs text-muted-foreground">
                {picked?.description}
            </p>
        </div>
    );
}

/** The two patches, in the switch's order. */
LoopedPatchSwitch.OPTIONS = [
    {
        value: "output",
        label: "Layer output",
        description:
            "Replaces only what the layer returns: the block its group of layers is still building. Completed blocks stay the target's.",
    },
    {
        value: "state",
        label: "Full state",
        description:
            "Replaces everything the model carries at the token after the layer: the block being built and every completed one.",
    },
] as const satisfies readonly { value: LoopedPatch; label: string; description: string }[];
