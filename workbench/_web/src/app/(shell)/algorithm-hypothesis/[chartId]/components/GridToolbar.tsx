"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type {
    AlgorithmHypothesisMode,
    AlgorithmView,
    ArrowMode,
    ChipLabel,
} from "@/types/algorithmHypothesis";
import { EXAMPLE_PROMPTS, GRID_OPTIONS } from "@/lib/algorithmHypothesis/grids";
import { ModeTabs } from "./ModeTabs";

interface GridToolbarProps {
    mode: AlgorithmHypothesisMode;
    onModeChange: (mode: AlgorithmHypothesisMode) => void;
    walkthroughOpen: boolean;
    onWalkthrough: () => void;
    prompt: string;
    onPromptChange: (prompt: string) => void;
    /** Prompts saved with the algorithm. */
    savedInputs: string[];
    onSaveInput: (prompt: string) => void;
    gridId: string;
    onGridChange: (gridId: string) => void;
    view: AlgorithmView;
    onViewChange: (view: Partial<AlgorithmView>) => void;
}

export function GridToolbar({
    mode,
    onModeChange,
    walkthroughOpen,
    onWalkthrough,
    prompt,
    onPromptChange,
    savedInputs,
    onSaveInput,
    gridId,
    onGridChange,
    view,
    onViewChange,
}: GridToolbarProps) {
    // The grid rebuilds when the prompt is committed (Enter or blur), not per keystroke.
    const [text, setText] = useState(prompt);
    useEffect(() => setText(prompt), [prompt]);
    const commit = () => {
        if (text !== prompt) onPromptChange(text);
    };

    return (
        <div className="flex flex-col border-b">
            <div className="p-3 border-b flex items-center justify-between">
                <h2 className="text-sm pl-2 font-medium whitespace-nowrap">Algorithm Hypothesis</h2>
                <div className="flex items-center gap-2">
                    <ModeTabs
                        mode={mode}
                        onModeChange={onModeChange}
                        walkthroughOpen={walkthroughOpen}
                        onWalkthrough={onWalkthrough}
                    />
                    <Select value={gridId} onValueChange={onGridChange}>
                        <SelectTrigger size="sm" aria-label="Grid">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="end">
                            {GRID_OPTIONS.map((o) => (
                                <SelectItem key={o.id} value={o.id}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 px-3 pt-2">
                <Label htmlFor="ah-prompt" className="sr-only">
                    Prompt
                </Label>
                <Input
                    id="ah-prompt"
                    className="min-w-64 flex-1 font-mono"
                    value={text}
                    spellCheck={false}
                    placeholder="Type a prompt and press Enter"
                    onChange={(e) => setText(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") commit();
                    }}
                />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                            Inputs
                            <ChevronDown />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-w-[28rem]">
                        {savedInputs.length > 0 && (
                            <>
                                <DropdownMenuLabel>Saved with this algorithm</DropdownMenuLabel>
                                {savedInputs.map((text) => (
                                    <DropdownMenuItem
                                        key={`saved-${text}`}
                                        className="font-mono text-xs"
                                        onSelect={() => onPromptChange(text)}
                                    >
                                        <span className="truncate">{text}</span>
                                    </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator />
                            </>
                        )}
                        <DropdownMenuLabel>Examples</DropdownMenuLabel>
                        {EXAMPLE_PROMPTS.map((p) => (
                            <DropdownMenuItem key={p.text} onSelect={() => onPromptChange(p.text)}>
                                {p.label}
                            </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            disabled={!prompt.trim() || savedInputs.includes(prompt)}
                            onSelect={() => onSaveInput(prompt)}
                        >
                            Save this prompt with the algorithm
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                        {view.focus.length
                            ? `${view.focus.length} token${view.focus.length === 1 ? "" : "s"} focused.`
                            : "Click tokens under the grid to focus them."}
                    </span>
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="ah-collapse"
                            checked={view.collapse}
                            disabled={!view.focus.length}
                            onCheckedChange={(c) => onViewChange({ collapse: c === true })}
                        />
                        <Label htmlFor="ah-collapse" className="text-xs font-normal">
                            Hide unfocused tokens
                        </Label>
                    </div>
                    {view.focus.length > 0 && (
                        <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-xs"
                            onClick={() => onViewChange({ focus: [], collapse: false })}
                        >
                            Clear focus
                        </Button>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Select
                        value={String(view.layerStep)}
                        onValueChange={(v) => onViewChange({ layerStep: Number(v) })}
                    >
                        <SelectTrigger size="sm" aria-label="Layer step">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="end">
                            {[1, 2, 4].map((s) => (
                                <SelectItem key={s} value={String(s)}>
                                    {s === 1 ? "Every layer" : `Every ${s} layers`}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select
                        value={view.arrows}
                        onValueChange={(v) => onViewChange({ arrows: v as ArrowMode })}
                    >
                        <SelectTrigger size="sm" aria-label="Arrows">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="end">
                            <SelectItem value="nearby">Nearby arrows</SelectItem>
                            <SelectItem value="all">All arrows</SelectItem>
                            <SelectItem value="none">No arrows</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select
                        value={view.labels}
                        onValueChange={(v) => onViewChange({ labels: v as ChipLabel })}
                    >
                        <SelectTrigger size="sm" aria-label="Show in cells">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="end">
                            <SelectItem value="values">Values</SelectItem>
                            <SelectItem value="names">Names</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </div>
    );
}
