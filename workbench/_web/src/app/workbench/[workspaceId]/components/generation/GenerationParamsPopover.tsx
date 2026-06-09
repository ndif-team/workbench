"use client";

import { useState, type KeyboardEvent } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SlidersHorizontal, X, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_GENERATION_PARAMS, type GenerationParams } from "@/types/generation";

interface GenerationParamsPopoverProps {
    params: GenerationParams;
    onChange: (patch: Partial<GenerationParams>) => void;
    disabled?: boolean;
}

export function GenerationParamsPopover({
    params,
    onChange,
    disabled,
}: GenerationParamsPopoverProps) {
    const [open, setOpen] = useState(false);
    const [stopDraft, setStopDraft] = useState("");

    const dirty = isDirty(params);

    const addStop = () => {
        const value = stopDraft;
        if (!value || params.stopSequences.includes(value)) {
            setStopDraft("");
            return;
        }
        onChange({ stopSequences: [...params.stopSequences, value] });
        setStopDraft("");
    };

    const removeStop = (s: string) =>
        onChange({ stopSequences: params.stopSequences.filter((x) => x !== s) });

    const handleStopKey = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            addStop();
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={disabled}
                            aria-label="Generation parameters"
                            className={cn(
                                "relative h-7 w-7 rounded-md text-muted-foreground hover:text-foreground",
                                dirty && "text-primary hover:text-primary",
                            )}
                        >
                            <SlidersHorizontal className="size-3.5" />
                            {dirty && (
                                <span
                                    aria-hidden
                                    className="absolute right-1 top-1 size-1.5 rounded-full bg-primary"
                                />
                            )}
                        </Button>
                    </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="top">Parameters</TooltipContent>
            </Tooltip>

            <PopoverContent align="end" sideOffset={8} className="w-80 rounded-md p-0">
                <div className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0">
                        <p className="text-sm font-medium leading-none">Parameters</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Applied to the next generation.
                        </p>
                    </div>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7 text-muted-foreground"
                                onClick={() => onChange({ ...DEFAULT_GENERATION_PARAMS })}
                                disabled={!dirty}
                                aria-label="Reset to defaults"
                            >
                                <RotateCcw className="size-3.5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">Reset</TooltipContent>
                    </Tooltip>
                </div>
                <Separator />

                <div className="space-y-4 px-4 py-4">
                    <ParamSlider
                        label="Max new tokens"
                        value={params.maxNewTokens}
                        min={1}
                        max={512}
                        step={1}
                        format={(v) => v.toString()}
                        onChange={(v) => onChange({ maxNewTokens: v })}
                    />

                    <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2">
                        <div className="min-w-0">
                            <Label
                                htmlFor="rail-sampling"
                                className="text-xs font-medium leading-none"
                            >
                                Sampling
                            </Label>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {params.sampling ? "Stochastic decoding." : "Greedy decoding."}
                            </p>
                        </div>
                        <Switch
                            id="rail-sampling"
                            checked={params.sampling}
                            onCheckedChange={(v) => onChange({ sampling: v })}
                        />
                    </div>

                    <div
                        className={cn(
                            "space-y-4 transition-opacity",
                            !params.sampling && "pointer-events-none opacity-40",
                        )}
                    >
                        <ParamSlider
                            label="Temperature"
                            value={params.temperature}
                            min={0}
                            max={2}
                            step={0.05}
                            format={(v) => v.toFixed(2)}
                            onChange={(v) => onChange({ temperature: v })}
                        />
                        <ParamSlider
                            label="Top-p"
                            value={params.topP}
                            min={0}
                            max={1}
                            step={0.01}
                            format={(v) => v.toFixed(2)}
                            onChange={(v) => onChange({ topP: v })}
                        />
                        <ParamSlider
                            label="Top-k"
                            value={params.topK}
                            min={0}
                            max={200}
                            step={1}
                            format={(v) => (v === 0 ? "off" : v.toString())}
                            onChange={(v) => onChange({ topK: v })}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="rail-stop" className="text-xs font-medium leading-none">
                            Stop sequences
                        </Label>
                        <div className="flex gap-1.5">
                            <Input
                                id="rail-stop"
                                value={stopDraft}
                                onChange={(e) => setStopDraft(e.target.value)}
                                onKeyDown={handleStopKey}
                                placeholder="e.g. \n\n"
                                className="h-8 font-mono text-xs"
                            />
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={addStop}
                                disabled={!stopDraft}
                            >
                                Add
                            </Button>
                        </div>
                        {params.stopSequences.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1.5">
                                {params.stopSequences.map((s) => (
                                    <span
                                        key={s}
                                        className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-[11px]"
                                    >
                                        <span className="max-w-[160px] truncate">
                                            {visibleStop(s)}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => removeStop(s)}
                                            className="rounded-sm text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                            aria-label={`Remove stop sequence ${s}`}
                                        >
                                            <X className="size-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}

export function isDirty(params: GenerationParams): boolean {
    const d = DEFAULT_GENERATION_PARAMS;
    return (
        params.maxNewTokens !== d.maxNewTokens ||
        params.temperature !== d.temperature ||
        params.topP !== d.topP ||
        params.topK !== d.topK ||
        params.sampling !== d.sampling ||
        params.stopSequences.length > 0
    );
}

function visibleStop(s: string) {
    return s.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
}

interface ParamSliderProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    format: (value: number) => string;
    onChange: (value: number) => void;
}

function ParamSlider({ label, value, min, max, step, format, onChange }: ParamSliderProps) {
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between">
                <Label className="text-xs font-medium leading-none">{label}</Label>
                <span className="font-mono text-xs tabular-nums text-foreground/90">
                    {format(value)}
                </span>
            </div>
            <Slider
                min={min}
                max={max}
                step={step}
                value={[value]}
                onValueChange={(v) => onChange(v[0] ?? value)}
                aria-label={label}
            />
        </div>
    );
}
