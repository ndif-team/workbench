import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

interface LensParamsProps {
    topk: number;
    onTopkChange: (topk: number) => void;
    includeEntropy: boolean;
    onIncludeEntropyChange: (on: boolean) => void;
    disabled: boolean;
}

/** The parameters a logit-lens and a j-lens run share: top-k and entropy. */
export function LensParams({
    topk,
    onTopkChange,
    includeEntropy,
    onIncludeEntropyChange,
    disabled,
}: LensParamsProps) {
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <Label htmlFor="topk" className="text-sm font-normal">
                    Top-K Predictions
                </Label>
                <span className="text-sm tabular-nums text-muted-foreground">{topk}</span>
            </div>
            <div className="flex items-center gap-4">
                <Slider
                    id="topk"
                    tone="tool"
                    min={1}
                    max={10}
                    step={1}
                    value={[topk]}
                    onValueChange={([value]) => onTopkChange(value)}
                    disabled={disabled}
                    className="min-w-0 flex-1"
                />
                <div className="flex shrink-0 items-center gap-2">
                    <Checkbox
                        id="entropy"
                        aria-label="Include entropy"
                        checked={includeEntropy}
                        onCheckedChange={(checked) => onIncludeEntropyChange(checked === true)}
                        disabled={disabled}
                        className="border-tool-accent focus-visible:ring-tool-accent data-[state=checked]:bg-tool-accent data-[state=checked]:text-tool-accent-foreground"
                    />
                    <Label htmlFor="entropy" className="cursor-pointer text-sm font-normal">
                        Entropy
                    </Label>
                </div>
            </div>
        </div>
    );
}
