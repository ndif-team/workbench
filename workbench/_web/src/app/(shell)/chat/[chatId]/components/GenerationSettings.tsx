import { useEffect, useId, useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import type { GenerationParams } from "@/types/chats";

/** The chat's sampling settings in a popover: temperature and the reply's token limit, saved when a slider is let go. */
export function GenerationSettings({
    params,
    onChange,
    disabled,
}: {
    params: GenerationParams;
    onChange: (params: GenerationParams) => void;
    disabled: boolean;
}) {
    const [draft, setDraft] = useState(params);
    useEffect(() => setDraft(params), [params]);
    const temperatureId = useId();
    const tokensId = useId();
    const commit = (next: Partial<GenerationParams>) => onChange({ ...draft, ...next });

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" disabled={disabled}>
                    <SlidersHorizontal className="size-3.5" />
                    <span className="tabular-nums">
                        {draft.temperature === 0 ? "Greedy" : `T ${draft.temperature.toFixed(1)}`}
                        {" · "}
                        {draft.maxNewTokens} tokens
                    </span>
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 space-y-5">
                <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                        <Label htmlFor={temperatureId}>Temperature</Label>
                        <span className="text-sm tabular-nums text-muted-foreground">
                            {draft.temperature.toFixed(1)}
                        </span>
                    </div>
                    <Slider
                        id={temperatureId}
                        min={0}
                        max={2}
                        step={0.1}
                        value={[draft.temperature]}
                        onValueChange={([temperature]) => setDraft({ ...draft, temperature })}
                        onValueCommit={([temperature]) => commit({ temperature })}
                        aria-label="Temperature"
                    />
                    <p className="text-xs text-muted-foreground">
                        0 always picks the most likely token.
                    </p>
                </div>
                <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                        <Label htmlFor={tokensId}>Max new tokens</Label>
                        <span className="text-sm tabular-nums text-muted-foreground">
                            {draft.maxNewTokens}
                        </span>
                    </div>
                    <Slider
                        id={tokensId}
                        min={16}
                        max={2048}
                        step={16}
                        value={[draft.maxNewTokens]}
                        onValueChange={([maxNewTokens]) => setDraft({ ...draft, maxNewTokens })}
                        onValueCommit={([maxNewTokens]) => commit({ maxNewTokens })}
                        aria-label="Max new tokens"
                    />
                </div>
            </PopoverContent>
        </Popover>
    );
}
