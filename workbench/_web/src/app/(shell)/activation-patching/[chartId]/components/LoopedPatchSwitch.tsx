import { ToolOptionSwitch, type ToolOption } from "@/app/(shell)/components/ToolOptionSwitch";
import type { LoopedPatch } from "@/types/activationPatching";

interface LoopedPatchSwitchProps {
    value: LoopedPatch;
    onChange: (patch: LoopedPatch) => void;
    disabled: boolean;
    explain?: "hover" | "inline";
}

/**
 * Switches how much of what a looped model holds at a token a patch replaces
 * at a layer visit. Shown only for those models: any other keeps one tensor
 * per token, so its patching has nothing to choose between.
 */
export function LoopedPatchSwitch(props: LoopedPatchSwitchProps) {
    return (
        <ToolOptionSwitch
            id="looped-patch"
            name="Patch"
            options={LoopedPatchSwitch.OPTIONS}
            {...props}
        />
    );
}

/** The patches, from the one that replaces least to the one that replaces most. */
LoopedPatchSwitch.OPTIONS = [
    {
        value: "active_block",
        label: "Active block",
        description:
            "Replaces only the active block: what the layer returns, the block its group of layers is still building. Completed blocks stay the target's.",
    },
    {
        value: "live_state",
        label: "Live state",
        description:
            "Replaces what the pass is working with at the token: the active block and the completed blocks. The copy later passes restart from stays the target's.",
    },
    {
        value: "full_state",
        label: "Full state",
        description:
            "Replaces everything the model holds at the token: the live state, and the copy of the pre-loop state that later passes restart from.",
    },
] as const satisfies readonly ToolOption<LoopedPatch>[];
