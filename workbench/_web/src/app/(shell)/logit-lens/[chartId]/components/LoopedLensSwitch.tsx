import { ToolOptionSwitch, type ToolOption } from "@/app/(shell)/components/ToolOptionSwitch";
import type { LoopedLens } from "@/types/logitLens";

interface LoopedLensSwitchProps {
    value: LoopedLens;
    onChange: (lens: LoopedLens) => void;
    disabled: boolean;
    explain?: "hover" | "inline";
}

/**
 * Switches how the logit lens reads a layer visit of a looped model. Shown
 * only for those models: any other has no layers after a loop to run a state
 * through.
 */
export function LoopedLensSwitch(props: LoopedLensSwitchProps) {
    return (
        <ToolOptionSwitch
            id="looped-lens"
            name="Lens"
            options={LoopedLensSwitch.OPTIONS}
            {...props}
        />
    );
}

LoopedLensSwitch.OPTIONS = [
    {
        value: "logit",
        label: "Logit",
        description:
            "Reads each layer visit's state directly: its blocks mixed as the model mixes them before its head, then the final norm and unembedding.",
    },
    {
        value: "coda",
        label: "Coda",
        description:
            "Runs the model's final block, the coda, on each visit's state before reading it. Visits inside the coda are read directly.",
    },
] as const satisfies readonly ToolOption<LoopedLens>[];
