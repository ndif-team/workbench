import { useEffect, useId, useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { DEFAULT_GENERATION_PARAMS, type ChatMode, type GenerationParams } from "@/types/chats";

/**
 * Why a chat's mode can't be switched: its first message settled it
 * (`isModeLocked`), or its model is a base model, which only continues text.
 */
export type ModeFixed = "started" | "base";

const MODE_FIXED_NOTES: Record<ModeFixed, string> = {
    started: "Set by the first message. Start a new chat to switch.",
    base: "A base model only continues text.",
};

const MODES: { mode: ChatMode; label: string; description: string }[] = [
    { mode: "chat", label: "Chat", description: "Turns, with the model's chat template." },
    { mode: "completion", label: "Completion", description: "One text the model continues." },
];

/**
 * A chat's settings behind an icon, in its composer and in Home's when Chat
 * is picked: its mode, temperature and the reply's token limit, the sliders
 * saved when let go. The icon's tooltip sums them up, and a dot on it marks
 * sampling changed from the defaults. `modeFixed` keeps the mode from being
 * switched, with a note saying why.
 */
export function GenerationSettings({
    mode,
    params,
    onModeChange,
    onChange,
    disabled,
    modeFixed,
}: {
    mode: ChatMode;
    params: GenerationParams;
    onModeChange: (mode: ChatMode) => void;
    onChange: (params: GenerationParams) => void;
    disabled: boolean;
    modeFixed?: ModeFixed;
}) {
    const [draft, setDraft] = useState(params);
    useEffect(() => setDraft(params), [params]);
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
            <PopoverContent side="top" align="end" className="w-56 space-y-3 p-3">
                <div className="space-y-1.5">
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
                                disabled={
                                    modeFixed === "started"
                                        ? m.mode !== mode
                                        : modeFixed === "base" && m.mode === "chat"
                                }
                                title={m.description}
                                onClick={() => m.mode !== mode && onModeChange(m.mode)}
                                className={cn(
                                    "h-6 rounded-sm text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                                    m.mode === mode
                                        ? "bg-accent text-accent-foreground"
                                        : "text-muted-foreground enabled:hover:text-foreground",
                                )}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                    {modeFixed && (
                        <p className="text-xs text-muted-foreground">
                            {MODE_FIXED_NOTES[modeFixed]}
                        </p>
                    )}
                </div>
                <SettingSlider
                    label="Temperature"
                    hint="0 always picks the most likely token."
                    shown={draft.temperature === 0 ? "Greedy" : draft.temperature.toFixed(1)}
                    min={0}
                    max={2}
                    step={0.1}
                    value={draft.temperature}
                    onChange={(temperature) => setDraft({ ...draft, temperature })}
                    onCommit={(temperature) => commit({ temperature })}
                />
                <SettingSlider
                    label="Max new tokens"
                    shown={String(draft.maxNewTokens)}
                    min={16}
                    max={2048}
                    step={16}
                    value={draft.maxNewTokens}
                    onChange={(maxNewTokens) => setDraft({ ...draft, maxNewTokens })}
                    onCommit={(maxNewTokens) => commit({ maxNewTokens })}
                />
            </PopoverContent>
        </Popover>
    );
}

/** One setting's slider, under its name and value (`hint` is the name's tooltip). */
function SettingSlider({
    label,
    hint,
    shown,
    value,
    onChange,
    onCommit,
    ...range
}: {
    label: string;
    hint?: string;
    shown: string;
    min: number;
    max: number;
    step: number;
    value: number;
    onChange: (value: number) => void;
    onCommit: (value: number) => void;
}) {
    const id = useId();
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
                <Label
                    htmlFor={id}
                    title={hint}
                    className="text-xs font-normal text-muted-foreground"
                >
                    {label}
                </Label>
                <span className="tabular-nums">{shown}</span>
            </div>
            <Slider
                id={id}
                {...range}
                value={[value]}
                onValueChange={([next]) => onChange(next)}
                onValueCommit={([next]) => onCommit(next)}
                aria-label={label}
            />
        </div>
    );
}
