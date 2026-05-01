"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBranchingGenerate } from "@/lib/api/branchingApi";
import type { BranchingConfigData, BranchingSamplingSpec } from "@/types/branching";

interface BranchingControlsProps {
    chartId: string;
    initialConfig: BranchingConfigData;
    selectedModel: string;
}

const DEFAULT_TEMPS: number[] = [0.4, 0.7, 1.0];

export function BranchingControls({
    chartId,
    initialConfig,
    selectedModel,
}: BranchingControlsProps) {
    const [prompt, setPrompt] = useState(initialConfig.prompt ?? "");
    const [maxTokens, setMaxTokens] = useState(initialConfig.max_tokens ?? 80);
    const [sampleCount, setSampleCount] = useState(initialConfig.samples?.length ?? 3);
    const [temperatures, setTemperatures] = useState<number[]>(
        initialConfig.samples?.map((s) => s.temperature) ?? DEFAULT_TEMPS,
    );

    const generate = useBranchingGenerate();

    const adjustSampleCount = (n: number) => {
        const bounded = Math.max(1, Math.min(5, n));
        setSampleCount(bounded);
        setTemperatures((prev) => {
            const next = [...prev];
            while (next.length < bounded)
                next.push(DEFAULT_TEMPS[next.length] ?? next[next.length - 1] ?? 0.7);
            while (next.length > bounded) next.pop();
            return next;
        });
    };

    const setTemp = (idx: number, value: number) => {
        setTemperatures((prev) => {
            const next = [...prev];
            next[idx] = value;
            return next;
        });
    };

    const onGenerate = () => {
        const samples: BranchingSamplingSpec[] = temperatures
            .slice(0, sampleCount)
            .map((t, i) => ({ temperature: t, seed: i, top_p: 1.0 }));
        const cfg: BranchingConfigData = {
            prompt,
            model: selectedModel,
            samples,
            max_tokens: maxTokens,
            top_k: 5,
        };
        generate.mutate({ config: cfg, chartId });
    };

    return (
        <div className="flex flex-col gap-4" data-testid="branching-controls">
            <div className="flex flex-col gap-1">
                <Label htmlFor="branching-prompt">Prompt</Label>
                <Textarea
                    id="branching-prompt"
                    data-testid="branching-prompt"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={3}
                    placeholder="Enter your prompt"
                />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                    <Label htmlFor="branching-samples">Samples</Label>
                    <Input
                        id="branching-samples"
                        data-testid="branching-sample-count"
                        type="number"
                        min={1}
                        max={5}
                        value={sampleCount}
                        onChange={(e) => adjustSampleCount(parseInt(e.target.value || "1", 10))}
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <Label htmlFor="branching-max-tokens">Max tokens</Label>
                    <Input
                        id="branching-max-tokens"
                        data-testid="branching-max-tokens"
                        type="number"
                        min={4}
                        max={400}
                        value={maxTokens}
                        onChange={(e) => setMaxTokens(parseInt(e.target.value || "80", 10))}
                    />
                </div>
            </div>

            <div className="flex flex-col gap-2">
                <Label>Per-sample temperature</Label>
                {temperatures.slice(0, sampleCount).map((t, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-12">#{i + 1}</span>
                        <Input
                            type="number"
                            data-testid={`branching-temp-${i}`}
                            step={0.1}
                            min={0.0}
                            max={2.0}
                            value={t}
                            onChange={(e) => setTemp(i, parseFloat(e.target.value || "0.7"))}
                        />
                    </div>
                ))}
            </div>

            <Button
                type="button"
                data-testid="branching-generate-button"
                onClick={onGenerate}
                disabled={generate.isPending || prompt.trim().length === 0}
                className="w-full"
            >
                {generate.isPending ? "Generating…" : "Generate variations"}
            </Button>

            {generate.isError && (
                <p className="text-xs text-red-500" data-testid="branching-generate-error">
                    {generate.error instanceof Error
                        ? generate.error.message
                        : "Generation failed"}
                </p>
            )}
        </div>
    );
}
