import { useEffect, useId, useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { DEFAULT_GENERATION_PARAMS, type ChatMode, type GenerationParams } from "@/types/chats";

const MODES: { mode: ChatMode; label: string; description: string }[] = [
    { mode: "chat", label: "Chat", description: "Turns, with the model's chat template." },
    { mode: "completion", label: "Completion", description: "One text the model continues." },
];

/**
 * The chat's settings behind an icon in its composer: its mode, temperature
 * and the reply's token limit, the sliders saved when let go. The icon's
 * tooltip sums them up, and a dot on it marks sampling changed from the
 * defaults.
 */
export function GenerationSettings({
    mode,
    params,
    onModeChange,
    onChange,
    disabled,
}: {
    mode: ChatMode;
    params: GenerationParams;
    onModeChange: (mode: ChatMode) => void;
    onChange: (params: GenerationParams) => void;
    disabled: boolean;
}) {
    const [draft, setDraft] = useState(params);
    useEffect(() => setDraft(params), [params]);
    const temperatureId = useId();
    const tokensId = useId();
    const commit = (next: Partial<GenerationParams>) => onChange({ ...draft, ...next });
    const current = MODES.find((m) => m.mode === mode) ?? MODES[0];
    const changed =
        params.temperature !== DEFAULT_GENERATION_PARAMS.temperature ||
        params.maxNewTokens !== DEFAULT_GENERATION_PARAMS.maxNewTokens;
    const summary = `${current.label} · ${
        params.temperature === 0 ? "Greedy" : `T ${params.temperature.toFixed(1)}`
    } · ${params.maxNewTokens} tokens`;

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={disabled}
                    title={summary}
                    aria-label={`Settings: ${summary}`}
                    className="relative shrink-0 text-muted-foreground hover:text-foreground"
                >
                    <SlidersHorizontal />
                    {changed && (
                        <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary" />
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent side="top" align="end" className="w-72 space-y-5">
                <div className="space-y-2">
                    <div
                        role="group"
                        aria-label="Mode"
                        className="grid grid-cols-2 gap-0.5 rounded-md border bg-card p-0.5 shadow-xs dark:bg-input/30"
                    >
                        {MODES.map((m) => (
                            <button
                                key={m.mode}
                                type="button"
                                aria-pressed={m.mode === mode}
                                onClick={() => m.mode !== mode && onModeChange(m.mode)}
                                className={cn(
                                    "h-7 rounded-sm text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                                    m.mode === mode
                                        ? "bg-accent text-accent-foreground"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground">{current.description}</p>
                </div>
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
