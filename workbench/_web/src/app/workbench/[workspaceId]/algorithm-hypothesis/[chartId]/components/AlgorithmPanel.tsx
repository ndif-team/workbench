"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Download, FileUp, FolderOpen, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { AlgorithmDefinition, VarType } from "@/types/algorithmHypothesis";
import type { AlgorithmListItem } from "@/lib/queries/algorithmQueries";
import { PRIMITIVES, show } from "@/lib/algorithmHypothesis/primitives";
import type { Evaluation } from "@/lib/algorithmHypothesis/engine";
import { describeType } from "@/lib/algorithmHypothesis/vartypes";
import { chipColor, TypeGlyph } from "./glyphs";
import { layerLabel, tokenLabel } from "./AlgorithmGrid";

export type SaveState = "saved" | "saving" | "error";

interface AlgorithmPanelProps {
    algorithmId: string;
    definition: AlgorithmDefinition;
    tokens: string[];
    evaluation: Evaluation;
    types: Map<string, VarType | null>;
    problems: { variableId: string | null; message: string }[];
    /** Autosave of the working copy. */
    saveState: SaveState;
    /** Whether the algorithm has a saved version, and whether it matches. */
    versionState: "draft" | "saved" | "changed";
    canSave: boolean;
    savingVersion: boolean;
    onSaveVersion: () => void;
    onRevert: () => void;
    algorithms: AlgorithmListItem[];
    prompt: string;
    onRename: (name: string) => void;
    onUsePrompt: (prompt: string) => void;
    onSaveInput: (prompt: string) => void;
    onRemoveInput: (prompt: string) => void;
    /** Token clicks in the grid mark special tokens. */
    markingSpecials: boolean;
    onToggleMarking: () => void;
    onEditVariable: (id: string) => void;
    onUseCurrentPrompt: () => void;
    onSwitchAlgorithm: (id: string | "new" | "duplicate") => void;
    /** Opens an algorithm from a JSON file, as Download writes it. */
    onOpenFile: (file: File) => void;
}

const VERSION_LABEL = {
    draft: "Not saved yet",
    saved: "Saved",
    changed: "Unsaved changes",
} as const;

export function AlgorithmPanel({
    algorithmId,
    definition,
    tokens,
    evaluation,
    types,
    problems,
    saveState,
    versionState,
    canSave,
    savingVersion,
    onSaveVersion,
    onRevert,
    algorithms,
    prompt,
    onRename,
    onUsePrompt,
    onSaveInput,
    onRemoveInput,
    markingSpecials,
    onToggleMarking,
    onEditVariable,
    onUseCurrentPrompt,
    onSwitchAlgorithm,
    onOpenFile,
}: AlgorithmPanelProps) {
    const [name, setName] = useState(definition.name);
    const fileInput = useRef<HTMLInputElement>(null);
    useEffect(() => setName(definition.name), [definition.name]);
    const commitName = () => {
        const trimmed = name.trim();
        if (trimmed && trimmed !== definition.name) onRename(trimmed);
        else setName(definition.name);
    };

    const vars = [...definition.variables].sort(
        (a, b) => a.cell.layer - b.cell.layer || a.cell.token - b.cell.token,
    );
    const problemIds = new Set(problems.map((p) => p.variableId));
    const json = JSON.stringify(definition, null, 2);
    const fileName = `${definition.name.replace(/[^A-Za-z0-9_-]+/g, "_").toLowerCase() || "algorithm"}.json`;

    const copyJson = async () => {
        try {
            await navigator.clipboard.writeText(json);
            toast.success("Copied the algorithm as JSON.");
        } catch {
            toast.error("Couldn't copy. Use Download instead.");
        }
    };
    const downloadJson = () => {
        const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="p-3 border-b flex items-center justify-between gap-2">
                <h2 className="text-sm pl-2 font-medium">Algorithm</h2>
                <div className="flex items-center gap-2">
                    <span
                        className={cn(
                            "text-xs",
                            saveState === "error" ? "text-destructive" : "text-muted-foreground",
                        )}
                        aria-live="polite"
                        title="Your edits are kept as a draft automatically. Save marks the algorithm as complete."
                    >
                        {saveState === "error"
                            ? "Couldn't keep your draft. Your next edit will retry."
                            : VERSION_LABEL[versionState]}
                    </span>
                    {versionState === "changed" && (
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" size="sm">
                                    Revert
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent
                                align="end"
                                className="flex w-64 flex-col gap-3 text-sm"
                            >
                                <p>Discard your changes since the last save?</p>
                                <Button variant="destructive" size="sm" onClick={onRevert}>
                                    Revert to saved
                                </Button>
                            </PopoverContent>
                        </Popover>
                    )}
                    <Button size="sm" disabled={!canSave || savingVersion} onClick={onSaveVersion}>
                        {savingVersion ? "Saving…" : "Save"}
                    </Button>
                </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 text-sm">
                {versionState !== "saved" && problems.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                        Fix the problems below to save. Your edits are kept as a draft meanwhile.
                    </p>
                )}
                {versionState === "draft" && !problems.length && (
                    <p className="text-xs text-muted-foreground">
                        Save the algorithm when it&apos;s complete. Saved algorithms appear next to
                        each other when you intervene.
                    </p>
                )}
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ah-alg-name">Name</Label>
                    <div className="flex gap-2">
                        <Input
                            id="ah-alg-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onBlur={commitName}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            }}
                        />
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" aria-label="Open another algorithm">
                                    <FolderOpen />
                                    Open
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
                                {(["saved", "draft"] as const).map((group) => {
                                    const items = algorithms.filter(
                                        (a) =>
                                            a.id !== algorithmId &&
                                            (group === "saved" ? !!a.savedAt : !a.savedAt),
                                    );
                                    if (!items.length) return null;
                                    return (
                                        <div key={group}>
                                            <DropdownMenuLabel>
                                                {group === "saved" ? "Saved" : "Drafts"}
                                            </DropdownMenuLabel>
                                            {items.map((a) => (
                                                <DropdownMenuItem
                                                    key={a.id}
                                                    onSelect={() => onSwitchAlgorithm(a.id)}
                                                >
                                                    {a.name}
                                                </DropdownMenuItem>
                                            ))}
                                            <DropdownMenuSeparator />
                                        </div>
                                    );
                                })}
                                <DropdownMenuItem onSelect={() => onSwitchAlgorithm("duplicate")}>
                                    Duplicate this algorithm
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => fileInput.current?.click()}>
                                    <FileUp />
                                    From file…
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <input
                            ref={fileInput}
                            type="file"
                            accept=".json,application/json"
                            className="hidden"
                            aria-label="Open an algorithm from a JSON file"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                e.target.value = "";
                                if (file) onOpenFile(file);
                            }}
                        />
                        <Button
                            variant="outline"
                            aria-label="New algorithm"
                            title="New algorithm"
                            onClick={() => onSwitchAlgorithm("new")}
                        >
                            <Plus />
                            New
                        </Button>
                    </div>
                    {definition.description && (
                        <p className="text-xs text-muted-foreground">{definition.description}</p>
                    )}
                </div>

                <div className="flex flex-col gap-1.5">
                    <Label>
                        Variables{" "}
                        <span className="text-muted-foreground tabular-nums">{vars.length}</span>
                    </Label>
                    {vars.length ? (
                        <ul className="flex flex-col">
                            {vars.map((v) => (
                                <li key={v.id}>
                                    <button
                                        type="button"
                                        onClick={() => onEditVariable(v.id)}
                                        title={`${describeType(types.get(v.id))} · ${
                                            v.function.kind === "python"
                                                ? "Python function"
                                                : PRIMITIVES[v.function.name]?.label
                                        }${v.tags?.length ? ` · ${v.tags.join(", ")}` : ""}`}
                                        className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left hover:bg-accent"
                                    >
                                        <span className="flex min-w-0 items-center gap-2">
                                            <span
                                                className={cn(
                                                    "inline-flex min-w-0 items-center gap-1 rounded-sm border bg-background px-1 py-0.5 font-mono text-xs",
                                                    chipColor(v.color).className,
                                                    definition.output === v.id && "font-semibold",
                                                    problemIds.has(v.id) &&
                                                        "border-destructive dark:border-destructive",
                                                )}
                                                style={chipColor(v.color).style}
                                            >
                                                <TypeGlyph
                                                    type={types.get(v.id)}
                                                    className="size-2.5"
                                                />
                                                <span className="truncate">{v.name}</span>
                                            </span>
                                            <span className="truncate font-mono text-xs text-muted-foreground">
                                                = {show(evaluation.values[v.id] ?? null)}
                                            </span>
                                            {v.tags && v.tags.length > 0 && (
                                                <span className="truncate text-xs text-muted-foreground">
                                                    {v.tags.join(", ")}
                                                </span>
                                            )}
                                        </span>
                                        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                                            {layerLabel(v.cell.layer)} ·{" "}
                                            {tokenLabel(tokens[v.cell.token] ?? "—")}
                                            {definition.output === v.id && " · output"}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            Click any cell in the grid to place a variable. The walkthrough builds
                            the paper&apos;s examples.
                        </p>
                    )}
                </div>

                {problems.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                        <Label>Before this algorithm can run</Label>
                        <ul className="flex flex-col gap-1 text-xs">
                            {problems.slice(0, 8).map((p, i) => (
                                <li key={i}>
                                    {p.variableId ? (
                                        <button
                                            type="button"
                                            className="text-left text-amber-700 hover:underline dark:text-amber-400"
                                            onClick={() => onEditVariable(p.variableId as string)}
                                        >
                                            {
                                                definition.variables.find(
                                                    (v) => v.id === p.variableId,
                                                )?.name
                                            }
                                            : {p.message}
                                        </button>
                                    ) : (
                                        <span className="text-amber-700 dark:text-amber-400">
                                            {p.message}
                                        </span>
                                    )}
                                </li>
                            ))}
                            {problems.length > 8 && (
                                <li className="text-muted-foreground">
                                    and {problems.length - 8} more
                                </li>
                            )}
                        </ul>
                    </div>
                )}

                <div className="flex flex-col gap-1.5">
                    <Label>Template</Label>
                    <p className="font-mono text-xs text-muted-foreground break-words">
                        {definition.template}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Variables and special tokens are anchored to token positions in the
                        template, so prompts with the same tokens line up. If a variable lands on
                        the wrong token, drag it.
                    </p>
                    {definition.template !== prompt && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="self-start"
                            onClick={onUseCurrentPrompt}
                        >
                            Use the current prompt as the template
                        </Button>
                    )}
                </div>

                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                        <Label>
                            Special tokens{" "}
                            <span className="text-muted-foreground tabular-nums">
                                {definition.specialTokens?.length ?? 0}
                            </span>
                        </Label>
                        <Button
                            variant={markingSpecials ? "default" : "outline"}
                            size="sm"
                            aria-pressed={markingSpecials}
                            onClick={onToggleMarking}
                        >
                            {markingSpecials ? "Done" : "Mark"}
                        </Button>
                    </div>
                    {definition.specialTokens?.length ? (
                        <div className="flex flex-wrap gap-1">
                            {definition.specialTokens.map((t) => (
                                <span
                                    key={t}
                                    className="rounded-sm border bg-background px-1.5 py-0.5 font-mono text-xs"
                                >
                                    {tokenLabel(tokens[t] ?? "?")}{" "}
                                    <span className="text-muted-foreground">{t}</span>
                                </span>
                            ))}
                        </div>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                        {markingSpecials
                            ? "Click tokens under the grid to mark or unmark them. Press Done or Escape when finished."
                            : "Tokens such as names. Position ID numbers them in order of first appearance, so a repeated name gets its first mention's ID."}
                    </p>
                </div>

                <div className="flex flex-col gap-1.5">
                    <Label>
                        Saved inputs{" "}
                        <span className="text-muted-foreground tabular-nums">
                            {definition.inputs?.length ?? 0}
                        </span>
                    </Label>
                    {definition.inputs?.length ? (
                        <ul className="flex flex-col">
                            {definition.inputs.map((text) => (
                                <li key={text} className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        title="Use as the prompt"
                                        onClick={() => onUsePrompt(text)}
                                        className={cn(
                                            "min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left font-mono text-xs hover:bg-accent",
                                            text === prompt && "text-primary",
                                        )}
                                    >
                                        {text}
                                    </button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-7 text-muted-foreground"
                                        aria-label={`Remove saved input: ${text}`}
                                        onClick={() => onRemoveInput(text)}
                                    >
                                        <X />
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            Prompts saved with the algorithm, offered as sources and targets when
                            you intervene.
                        </p>
                    )}
                    {!definition.inputs?.includes(prompt) && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="self-start"
                            onClick={() => onSaveInput(prompt)}
                        >
                            Save the current prompt
                        </Button>
                    )}
                </div>

                <div className="flex flex-col gap-1.5">
                    <Label>Export</Label>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={copyJson}>
                            <Copy />
                            Copy JSON
                        </Button>
                        <Button variant="outline" size="sm" onClick={downloadJson}>
                            <Download />
                            Download
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Anyone can open the downloaded file here with Open, From file. Or load it in
                        Python as a causalab model with the algorithm_hypothesis package:
                    </p>
                    <pre className="overflow-x-auto rounded-md border bg-card p-2 font-mono text-xs">
                        {`from algorithm_hypothesis import compile_algorithm\ncompiled = compile_algorithm("${fileName}")\ncompiled.model  # causalab CausalModel`}
                    </pre>
                </div>
            </div>
        </div>
    );
}
