"use client";

import { useState } from "react";
import { ClipboardPaste, Copy, Pencil, Plus, X } from "lucide-react";
import { useTheme } from "next-themes";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { pythonLanguage } from "@codemirror/lang-python";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectSeparator,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { AlgorithmDefinition, PrimitiveName, Ref, VarType } from "@/types/algorithmHypothesis";
import { byId } from "@/lib/algorithmHypothesis/engine";
import {
    PRIMITIVES,
    PRIMITIVE_NAMES,
    isDistribution,
    isError,
    isPending,
    primitiveSource,
    show,
    type Value,
} from "@/lib/algorithmHypothesis/primitives";
import type { PythonStatus } from "@/lib/algorithmHypothesis/python";
import { STRING, describeType, type Subst } from "@/lib/algorithmHypothesis/vartypes";
import { ColorSwatch, TypeGlyph, VARIABLE_COLORS } from "./glyphs";
import { layerLabel, tokenLabel } from "./AlgorithmGrid";
import {
    addPythonArg,
    convertToPython,
    isAutoSlot,
    refreshSpecials,
    withDefaultName,
    removePythonArg,
    removeRef,
    renameArg,
    slotsOf,
    withFunction,
    type DraftProblems,
    type VariableDraft,
} from "./draft";

interface VariablePanelProps {
    draft: VariableDraft;
    /** The saved algorithm (without the draft). */
    definition: AlgorithmDefinition;
    tokens: string[];
    /** The draft's type and the type variables its arguments bind. */
    typeInfo: { type: VarType | null; subst: Subst };
    typeOfRef: (r: Ref) => VarType | null;
    preview: Value;
    pythonStatus: PythonStatus;
    /** Tags used elsewhere in the algorithm, offered as suggestions. */
    tagSuggestions: string[];
    /** The copied variable's name, if any. */
    clipboardName: string | null;
    onCopy: () => void;
    onPaste: () => void;
    problems: DraftProblems;
    onChange: (draft: VariableDraft) => void;
    onSave: () => void;
    onCancel: () => void;
    onDelete: () => void;
}

const KIND_LABEL: Record<VarType["kind"], string> = {
    string: "string",
    int: "int",
    position: "position ID",
    pair: "key : value pair",
};

/** Choose a type; a pair chooses its key and value types the same way. */
function TypePicker({
    value,
    onChange,
    depth = 0,
    label = "Type",
}: {
    value: VarType;
    onChange: (t: VarType) => void;
    depth?: number;
    label?: string;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <Select
                value={value.kind}
                onValueChange={(k) =>
                    onChange(
                        k === "pair"
                            ? { kind: "pair", key: STRING, value: STRING }
                            : ({ kind: k } as VarType),
                    )
                }
            >
                <SelectTrigger size="sm" className="w-fit" aria-label={label}>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {(["string", "int", "position", "pair"] as const)
                        .filter((k) => k !== "pair" || depth < 3)
                        .map((k) => (
                            <SelectItem key={k} value={k}>
                                {KIND_LABEL[k]}
                            </SelectItem>
                        ))}
                </SelectContent>
            </Select>
            {value.kind === "pair" && (
                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 gap-y-1.5 border-l-2 pl-3">
                    <span className="pt-1.5 text-xs text-muted-foreground">key</span>
                    <TypePicker
                        value={value.key}
                        depth={depth + 1}
                        label="Key type"
                        onChange={(key) => onChange({ ...value, key })}
                    />
                    <span className="pt-1.5 text-xs text-muted-foreground">value</span>
                    <TypePicker
                        value={value.value}
                        depth={depth + 1}
                        label="Value type"
                        onChange={(v) => onChange({ ...value, value: v })}
                    />
                </div>
            )}
        </div>
    );
}

const PYTHON_EDITOR_EXTENSIONS = [
    pythonLanguage,
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ "aria-label": "Python function" }),
];

/** Default (black, white in dark mode), a palette color, or any custom color. */
function ColorPicker({
    value,
    onChange,
}: {
    value: string | null;
    onChange: (color: string | null) => void;
}) {
    const custom = !!value && value.startsWith("#");
    const ring = "ring-2 ring-primary ring-offset-2 ring-offset-background";
    return (
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Color">
            <button
                type="button"
                role="radio"
                aria-checked={!value}
                aria-label="Default color"
                title="Default"
                onClick={() => onChange(null)}
                className={cn(
                    "flex size-5 items-center justify-center rounded-full border",
                    !value && ring,
                )}
            >
                <span className="size-3 rounded-full bg-foreground" />
            </button>
            {VARIABLE_COLORS.map((c) => (
                <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={value === c}
                    aria-label={c}
                    title={c}
                    onClick={() => onChange(c)}
                    className={cn(
                        "flex size-5 items-center justify-center rounded-full",
                        value === c && ring,
                    )}
                >
                    <ColorSwatch color={c} className="size-4" />
                </button>
            ))}
            <label
                title="Custom color"
                className={cn(
                    "relative flex size-5 cursor-pointer items-center justify-center rounded-full border",
                    custom && ring,
                )}
            >
                {custom ? (
                    <ColorSwatch color={value} className="size-4" />
                ) : (
                    <Plus className="size-3 text-muted-foreground" />
                )}
                <input
                    type="color"
                    aria-label="Custom color"
                    className="absolute inset-0 size-full cursor-pointer opacity-0"
                    value={custom ? value : "#6366f1"}
                    onChange={(e) => onChange(e.target.value)}
                />
            </label>
        </div>
    );
}

function TagEditor({
    tags,
    suggestions,
    onChange,
}: {
    tags: string[];
    suggestions: string[];
    onChange: (tags: string[]) => void;
}) {
    const [text, setText] = useState("");
    const add = () => {
        const t = text.trim();
        if (t && !tags.includes(t)) onChange([...tags, t]);
        setText("");
    };
    const offered = suggestions.filter((t) => !tags.includes(t));
    return (
        <div className="flex flex-col gap-1.5">
            {tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {tags.map((t) => (
                        <span
                            key={t}
                            className="inline-flex items-center gap-1 rounded-sm border bg-background px-1.5 py-0.5 text-xs"
                        >
                            {t}
                            <button
                                type="button"
                                aria-label={`Remove tag ${t}`}
                                className="text-muted-foreground hover:text-foreground"
                                onClick={() => onChange(tags.filter((x) => x !== t))}
                            >
                                <X className="size-3" />
                            </button>
                        </span>
                    ))}
                </div>
            )}
            <Input
                aria-label="Add a tag"
                list="ah-tag-suggestions"
                className="h-8 py-0 text-xs"
                placeholder="Add a tag, then press Enter"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={add}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        add();
                    }
                }}
            />
            {offered.length > 0 && (
                <datalist id="ah-tag-suggestions">
                    {offered.map((t) => (
                        <option key={t} value={t} />
                    ))}
                </datalist>
            )}
        </div>
    );
}

function TypeName({ type }: { type: VarType | null }) {
    return (
        <span className="inline-flex items-center gap-1.5 font-mono text-xs">
            <TypeGlyph type={type} className="size-2.5" />
            {describeType(type)}
        </span>
    );
}

export function VariablePanel({
    draft,
    definition,
    tokens,
    typeInfo,
    typeOfRef,
    preview,
    pythonStatus,
    tagSuggestions,
    clipboardName,
    onCopy,
    onPaste,
    problems,
    onChange,
    onSave,
    onCancel,
    onDelete,
}: VariablePanelProps) {
    const vars = byId(definition);
    const { resolvedTheme } = useTheme();
    const lastLayer = definition.grid.layers - 1;
    const lastToken = tokens.length - 1;
    const isOutputCell = draft.cell.layer === lastLayer && draft.cell.token === lastToken;
    const slots = slotsOf(draft);
    const readers = draft.isNew
        ? []
        : definition.variables.filter((v) =>
              v.args.some((a) => a.refs.some((r) => "variable" in r && r.variable === draft.id)),
          );

    const refLabel = (r: Ref) =>
        "variable" in r
            ? (vars.get(r.variable)?.name ?? "?")
            : `“${tokenLabel(tokens[r.token] ?? "")}” ${r.token}`;

    const fnValue = draft.function.kind === "python" ? "python" : draft.function.name;
    const primitive = draft.function.kind === "primitive" ? PRIMITIVES[draft.function.name] : null;
    const toPython = () =>
        onChange(withDefaultName(definition, convertToPython(draft, typeInfo.type)));

    const setOption = (name: string, value: string) => {
        if (draft.function.kind !== "primitive") return;
        const spec = primitive?.options.find((o) => o.name === name);
        const parsed =
            typeof spec?.default === "number" &&
            value.trim() !== "" &&
            Number.isFinite(Number(value))
                ? Number(value)
                : value;
        onChange({
            ...draft,
            function: {
                ...draft.function,
                options: { ...draft.function.options, [name]: parsed },
            },
        });
    };

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="p-3 border-b flex items-center justify-between">
                <h2 className="text-sm pl-2 font-medium">
                    {draft.isNew ? "New variable" : "Edit variable"}
                </h2>
                <Button variant="ghost" size="icon" aria-label="Close panel" onClick={onCancel}>
                    <X />
                </Button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 text-sm">
                {draft.isNew && clipboardName && (
                    <div className="flex items-center justify-between gap-2 rounded-md border bg-card p-2">
                        <span className="min-w-0 truncate text-xs text-muted-foreground">
                            Copied:{" "}
                            <span className="font-mono text-foreground">{clipboardName}</span>
                        </span>
                        <Button variant="outline" size="sm" onClick={onPaste}>
                            <ClipboardPaste />
                            Paste here
                        </Button>
                    </div>
                )}
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ah-var-name">Name</Label>
                    <Input
                        id="ah-var-name"
                        autoFocus={draft.isNew}
                        className="py-0 font-mono"
                        value={draft.name}
                        placeholder="position"
                        spellCheck={false}
                        onChange={(e) =>
                            onChange({ ...draft, name: e.target.value, nameTouched: true })
                        }
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !problems.blocking.length) onSave();
                        }}
                    />
                </div>

                <div className="flex flex-col gap-1.5">
                    <Label>Location</Label>
                    <div className="flex gap-2">
                        <Select
                            value={String(draft.cell.token)}
                            onValueChange={(v) =>
                                onChange({ ...draft, cell: { ...draft.cell, token: Number(v) } })
                            }
                        >
                            <SelectTrigger className="min-w-0 flex-1" aria-label="Token">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {tokens.map((t, i) => (
                                    <SelectItem key={i} value={String(i)}>
                                        {`${tokenLabel(t)} · ${i}`}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select
                            value={String(draft.cell.layer)}
                            onValueChange={(v) =>
                                onChange({ ...draft, cell: { ...draft.cell, layer: Number(v) } })
                            }
                        >
                            <SelectTrigger className="w-24" aria-label="Layer">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {Array.from({ length: definition.grid.layers }, (_, l) => (
                                    <SelectItem key={l} value={String(l)}>
                                        {layerLabel(l)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {!draft.isNew && (
                        <p className="text-xs text-muted-foreground">
                            You can also drag the variable in the grid, or Alt-drag (Option on a
                            Mac) to copy it.
                        </p>
                    )}
                </div>

                <div className="flex flex-col gap-1.5">
                    <Label>Function</Label>
                    <Select
                        value={fnValue}
                        onValueChange={(v) =>
                            onChange(
                                withDefaultName(
                                    definition,
                                    refreshSpecials(
                                        definition,
                                        withFunction(
                                            draft,
                                            v as PrimitiveName | "python",
                                            typeInfo.type,
                                        ),
                                    ),
                                ),
                            )
                        }
                    >
                        <SelectTrigger className="w-full" aria-label="Function">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {PRIMITIVE_NAMES.map((name) => (
                                <SelectItem key={name} value={name}>
                                    {PRIMITIVES[name].label}
                                </SelectItem>
                            ))}
                            <SelectSeparator />
                            <SelectItem value="python">Custom</SelectItem>
                        </SelectContent>
                    </Select>
                    {primitive &&
                        primitive.options.length > 0 &&
                        draft.function.kind === "primitive" && (
                            <div className="flex flex-wrap gap-3 pt-1">
                                {primitive.options.map((o) => {
                                    const value = String(
                                        (draft.function.kind === "primitive"
                                            ? draft.function.options[o.name]
                                            : undefined) ?? o.default,
                                    );
                                    return (
                                        <div key={o.name} className="flex items-center gap-2">
                                            <Label
                                                htmlFor={`ah-opt-${o.name}`}
                                                className="text-xs text-muted-foreground font-normal"
                                            >
                                                {o.label}
                                            </Label>
                                            {o.choices ? (
                                                <Select
                                                    value={value}
                                                    onValueChange={(v) => setOption(o.name, v)}
                                                >
                                                    <SelectTrigger
                                                        id={`ah-opt-${o.name}`}
                                                        size="sm"
                                                    >
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {o.choices.map((c) => (
                                                            <SelectItem key={c} value={c}>
                                                                {c}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            ) : (
                                                <Input
                                                    id={`ah-opt-${o.name}`}
                                                    className={cn(
                                                        "h-8 py-0 font-mono",
                                                        typeof o.default === "number"
                                                            ? "w-20"
                                                            : "w-36",
                                                    )}
                                                    value={value}
                                                    onChange={(e) =>
                                                        setOption(o.name, e.target.value)
                                                    }
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    {draft.function.kind === "primitive" ? (
                        <>
                            <pre
                                tabIndex={0}
                                title="Double-click to edit as your own Python function"
                                onDoubleClick={toPython}
                                className="max-h-72 cursor-text overflow-auto rounded-md border bg-card p-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap"
                            >
                                {primitiveSource(draft.function.name, draft.function.options)}
                            </pre>
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-xs text-muted-foreground">
                                    Double-click the code to edit it as your own Python function.
                                </p>
                                <Button variant="ghost" size="sm" onClick={toPython}>
                                    <Pencil />
                                    Edit as Python
                                </Button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="overflow-hidden rounded-md border text-xs">
                                <CodeMirror
                                    value={draft.function.source}
                                    minHeight="10rem"
                                    maxHeight="24rem"
                                    theme={resolvedTheme === "dark" ? "dark" : "light"}
                                    extensions={PYTHON_EDITOR_EXTENSIONS}
                                    basicSetup={{ foldGutter: false, highlightActiveLine: false }}
                                    onChange={(source) =>
                                        onChange({
                                            ...draft,
                                            function: { kind: "python", source },
                                            codeTouched: true,
                                        })
                                    }
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                <span className="font-mono">compute</span> takes one parameter per
                                argument; an argument with several references arrives as a list. It
                                runs in your browser with Pyodide;{" "}
                                <span className="font-mono">Pair</span>,{" "}
                                <span className="font-mono">math</span> and{" "}
                                <span className="font-mono">show</span> are available, and a{" "}
                                <span className="font-mono">template</span> parameter receives the
                                template&apos;s tokens.
                            </p>
                        </>
                    )}
                </div>

                <div className="flex flex-col gap-1.5">
                    <Label>Type</Label>
                    {draft.function.kind === "python" ? (
                        <>
                            <TypePicker
                                value={draft.type ?? STRING}
                                onChange={(type) => onChange({ ...draft, type })}
                            />
                            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                <span className="font-mono">compute</span> returns
                                <TypeName type={draft.type ?? STRING} />
                            </p>
                        </>
                    ) : typeInfo.type ? (
                        <TypeName type={typeInfo.type} />
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            {primitive?.returns
                                ? `${describeType(primitive.returns, typeInfo.subst)}: fills in once the arguments are chosen.`
                                : "Set by the function's options."}
                        </p>
                    )}
                </div>

                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                        <Label>Arguments</Label>
                        {draft.function.kind === "python" && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onChange(addPythonArg(draft))}
                            >
                                <Plus />
                                Add argument
                            </Button>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {draft.activeSlot
                            ? `Click tokens or variables in the grid to fill ${draft.activeSlot}. Each one draws an arrow into this cell.`
                            : draft.function.kind === "python"
                              ? "Click a token or variable in the grid to add it as a new argument, or choose an argument to fill."
                              : slots.length
                                ? "Choose an argument, then click tokens or variables in the grid."
                                : "This function takes no arguments."}
                    </p>
                    <ul className="flex flex-col gap-1.5">
                        {slots.map((slot) => {
                            const refs = draft.args.find((a) => a.name === slot.name)?.refs ?? [];
                            const active = draft.activeSlot === slot.name;
                            const auto = isAutoSlot(draft, slot.name);
                            return (
                                <li
                                    key={slot.name}
                                    className={cn(
                                        "flex flex-col gap-1.5 rounded-md border bg-card p-2",
                                        active && "border-primary ring-1 ring-primary",
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                        {slot.custom ? (
                                            <Input
                                                aria-label="Argument name"
                                                className="h-8 w-32 py-0 font-mono text-xs"
                                                value={slot.name}
                                                spellCheck={false}
                                                onChange={(e) =>
                                                    onChange(
                                                        renameArg(draft, slot.name, e.target.value),
                                                    )
                                                }
                                            />
                                        ) : (
                                            <span className="font-mono text-xs font-medium">
                                                {slot.name}
                                            </span>
                                        )}
                                        {slot.pattern && (
                                            <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                                                {describeType(slot.pattern, typeInfo.subst)}
                                            </span>
                                        )}
                                        <span className="flex-1" />
                                        {!auto && (
                                            <Button
                                                size="sm"
                                                variant={active ? "default" : "outline"}
                                                aria-pressed={active}
                                                onClick={() =>
                                                    onChange({
                                                        ...draft,
                                                        activeSlot: active ? null : slot.name,
                                                        pickError: null,
                                                    })
                                                }
                                            >
                                                {active ? "Picking" : "Pick"}
                                            </Button>
                                        )}
                                        {slot.custom && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                aria-label={`Remove argument ${slot.name}`}
                                                onClick={() =>
                                                    onChange(removePythonArg(draft, slot.name))
                                                }
                                            >
                                                <X />
                                            </Button>
                                        )}
                                    </div>
                                    {refs.length ? (
                                        <div className="flex flex-wrap gap-1">
                                            {refs.map((r, i) => (
                                                <span
                                                    key={i}
                                                    title={describeType(typeOfRef(r))}
                                                    className="inline-flex items-center gap-1 rounded-sm border bg-background px-1.5 py-0.5 font-mono text-xs"
                                                >
                                                    <TypeGlyph
                                                        type={typeOfRef(r)}
                                                        className="size-2.5"
                                                    />
                                                    {refLabel(r)}
                                                    {!auto && (
                                                        <button
                                                            type="button"
                                                            aria-label={`Remove ${refLabel(r)}`}
                                                            className="text-muted-foreground hover:text-foreground"
                                                            onClick={() =>
                                                                onChange(
                                                                    removeRef(draft, slot.name, i),
                                                                )
                                                            }
                                                        >
                                                            <X className="size-3" />
                                                        </button>
                                                    )}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <span className="text-xs text-muted-foreground">Empty</span>
                                    )}
                                    {auto && (
                                        <span className="text-xs text-muted-foreground">
                                            {refs.length
                                                ? "The algorithm's special tokens up to this cell. Change them in the Algorithm panel."
                                                : "No special tokens yet. Mark them (such as names) in the Algorithm panel."}
                                        </span>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                    {draft.pickError && (
                        <p className="text-xs text-destructive" role="alert">
                            {draft.pickError}
                        </p>
                    )}
                </div>

                <div className="flex flex-col gap-1.5">
                    <Label>Color</Label>
                    <ColorPicker
                        value={draft.color}
                        onChange={(color) => onChange({ ...draft, color })}
                    />
                </div>

                <div className="flex flex-col gap-1.5">
                    <Label>Tags</Label>
                    <TagEditor
                        tags={draft.tags}
                        suggestions={tagSuggestions}
                        onChange={(tags) => onChange({ ...draft, tags })}
                    />
                    <p className="text-xs text-muted-foreground">
                        For your own bookkeeping, such as the algorithm a variable serves.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Checkbox
                        id="ah-var-output"
                        checked={draft.isOutput}
                        disabled={!isOutputCell}
                        onCheckedChange={(c) => onChange({ ...draft, isOutput: c === true })}
                    />
                    <Label
                        htmlFor="ah-var-output"
                        className={cn(!isOutputCell && "text-muted-foreground")}
                    >
                        Output variable
                    </Label>
                </div>
                {!isOutputCell && (
                    <p className="-mt-3 text-xs text-muted-foreground">
                        Only a variable at {layerLabel(lastLayer)}, token {lastToken} can be the
                        output.
                    </p>
                )}

                <div
                    className="flex flex-col gap-1 rounded-md border bg-card p-3"
                    aria-live="polite"
                >
                    <span className="text-xs text-muted-foreground">Value on this prompt</span>
                    <span
                        className={cn(
                            "font-mono text-base",
                            isError(preview) && "text-destructive",
                        )}
                    >
                        {show(preview)}
                    </span>
                    {isDistribution(preview) && (
                        <span className="font-mono text-xs text-muted-foreground">
                            {preview.items
                                .map((x) => `${x.label} ${Math.round(x.p * 100)}%`)
                                .join(" · ")}
                        </span>
                    )}
                    {isPending(preview) && (
                        <span className="text-xs text-muted-foreground">
                            {pythonStatus === "loading" || pythonStatus === "idle"
                                ? "Loading Python in your browser. This takes a few seconds the first time."
                                : "Running…"}
                        </span>
                    )}
                    {isError(preview) && (
                        <span className="font-mono text-xs whitespace-pre-wrap text-destructive">
                            {preview.message}
                        </span>
                    )}
                </div>

                {(problems.blocking.length > 0 || problems.incomplete.length > 0) && (
                    <ul className="flex flex-col gap-1 text-xs" role="alert">
                        {problems.blocking.map((p) => (
                            <li key={p} className="text-destructive">
                                {p}
                            </li>
                        ))}
                        {problems.incomplete.map((p) => (
                            <li key={p} className="text-amber-700 dark:text-amber-400">
                                {p} You can save now and finish later.
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className="p-3 border-t flex items-center gap-2">
                {!draft.isNew && (
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                            >
                                Delete
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="flex w-72 flex-col gap-3 text-sm">
                            <p>
                                Delete{" "}
                                <span className="font-mono">{draft.name || "this variable"}</span>?
                                {readers.length > 0 &&
                                    ` ${readers.map((r) => r.name).join(", ")} will lose ${readers.length === 1 ? "an argument" : "arguments"}.`}
                            </p>
                            <Button variant="destructive" size="sm" onClick={onDelete}>
                                Delete variable
                            </Button>
                        </PopoverContent>
                    </Popover>
                )}
                {!draft.isNew && (
                    <Button
                        variant="ghost"
                        onClick={onCopy}
                        title="Copy this variable (Ctrl/⌘ C), then paste it into another cell"
                    >
                        <Copy />
                        Copy
                    </Button>
                )}
                <span className="flex-1" />
                <Button variant="outline" onClick={onCancel}>
                    Cancel
                </Button>
                <Button onClick={onSave} disabled={problems.blocking.length > 0}>
                    {draft.isNew ? "Add variable" : "Save"}
                </Button>
            </div>
        </div>
    );
}
