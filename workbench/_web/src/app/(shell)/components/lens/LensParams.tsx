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
        <>
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <Label htmlFor="topk" className="text-sm font-medium">
                        Top-K Predictions
                    </Label>
                    <span className="text-sm text-muted-foreground">{topk}</span>
                </div>
                <Slider
                    id="topk"
                    min={1}
                    max={10}
                    step={1}
                    value={[topk]}
                    onValueChange={([value]) => onTopkChange(value)}
                    disabled={disabled}
                    className="w-full"
                />
            </div>

            <div className="flex items-center gap-2">
                <Checkbox
                    id="entropy"
                    checked={includeEntropy}
                    onCheckedChange={(checked) => onIncludeEntropyChange(checked === true)}
                    disabled={disabled}
                />
                <Label htmlFor="entropy" className="text-sm font-medium cursor-pointer">
                    Include Entropy
                </Label>
            </div>
        </>
    );
}
