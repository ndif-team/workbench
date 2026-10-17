"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import type {
    AlgorithmDefinition,
    AlgorithmHypothesisChartData,
    AlgorithmHypothesisMode,
} from "@/types/algorithmHypothesis";
import {
    evaluate,
    fullSweep,
    outputOf,
    tokenSweep,
    type EvaluateOptions,
    type SweepRow,
} from "@/lib/algorithmHypothesis/engine";
import { isError, isPending, show, type Value } from "@/lib/algorithmHypothesis/primitives";
import { pythonResolver, usePythonRuntime } from "@/lib/algorithmHypothesis/python";
import { EXAMPLE_PROMPTS } from "@/lib/algorithmHypothesis/grids";
import { useComparedAlgorithms, type ComparedAlgorithm } from "./comparison";
import { InputRow, ROLE_DOT, useTokens, type Role } from "./inputs";
import { layerLabel, tokenLabel } from "./AlgorithmGrid";
import { ModeTabs } from "./ModeTabs";

/**
 * Visualizer 2 (design doc §7): pick a token, and for every layer from the
 * embedding row to the top run the interchange intervention on that token's
 * cell, same position in both inputs (Q16). Each algorithm gets a strip of
 * counterfactual outputs, colored by output: the algorithm's version of the
 * paper's Figure 2. "Full grid" sweeps every position at once.
 */

export type SweepState = NonNullable<AlgorithmHypothesisChartData["sweep"]>;

interface SweepViewProps {
    workspaceId: string;
    algorithmId: string;
    definition: AlgorithmDefinition;
    savedDefinition: AlgorithmDefinition | null;
    templateTokens: string[];
    state: SweepState;
    onStateChange: (state: SweepState) => void;
    onSaveInput: (text: string) => void;
    onModeChange: (mode: AlgorithmHypothesisMode) => void;
    walkthroughOpen: boolean;
    onWalkthrough: () => void;
    mobile?: boolean;
}

/** Colors for counterfactual outputs other than the target's own. */
const OUTPUT_COLORS = [
    "bg-teal-600 text-white",
    "bg-orange-500 text-white",
    "bg-red-700 text-white",
    "bg-blue-600 text-white",
    "bg-lime-500 text-black",
    "bg-amber-400 text-black",
    "bg-emerald-800 text-white",
    "bg-stone-600 text-white",
];
const UNCHANGED = "bg-muted text-muted-foreground";
const NOTHING_STYLE: CSSProperties = {
    backgroundImage:
        "repeating-linear-gradient(45deg, hsl(var(--muted-foreground) / 0.25) 0 3px, transparent 3px 7px)",
};

interface Swept {
    algorithm: ComparedAlgorithm;
    /** The algorithm's output on the target, without intervention. */
    baseline: Value;
    rows: SweepRow[];
}

/** A color slot for an output label, the same in every view (a string hash). */
function colorSlot(label: string): number {
    let h = 0;
    for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h % OUTPUT_COLORS.length;
}

/** Each distinct counterfactual output gets its own color: its hashed slot, or
 * the next free one if another output in this view took it. */
function outputPalette(strips: { baseline: Value; rows: SweepRow[] }[]): Map<string, string> {
    const labels = new Set<string>();
    for (const s of strips)
        for (const r of s.rows) {
            const label = show(r.output);
            if (label === show(s.baseline) || isPending(r.output) || isError(r.output)) continue;
            if (r.output !== null) labels.add(label);
        }
    const colors = new Map<string, string>();
    const used = new Set<number>();
    for (const label of [...labels].sort()) {
        let slot = colorSlot(label);
        for (let i = 0; i < OUTPUT_COLORS.length && used.has(slot); i++)
            slot = (slot + 1) % OUTPUT_COLORS.length;
        used.add(slot);
        colors.set(label, OUTPUT_COLORS[slot]);
    }
    return colors;
}

function cellLook(row: SweepRow, baseline: Value, palette: Map<string, string>) {
    const label = show(row.output);
    if (isError(row.output)) return { className: "border border-destructive text-destructive" };
    if (isPending(row.output)) return { className: UNCHANGED };
    if (row.output === null && show(baseline) !== label)
        return { className: "border text-muted-foreground", style: NOTHING_STYLE };
    const unchanged = label === show(baseline);
    return {
        className: cn(
            unchanged ? UNCHANGED : palette.get(label),
            row.status !== "ok" && "opacity-40",
        ),
    };
}

const rowTitle = (a: ComparedAlgorithm, row: SweepRow) =>
    `${a.name} · ${row.layer < 0 ? "Emb" : layerLabel(row.layer)}: ${show(row.output)}${
        row.status === "empty" ? " (nothing to swap in this cell)" : ""
    }`;

/** Where an algorithm's output changes: "jam at L5–L6 · pie at L7". */
function changeSummary(rows: SweepRow[], baseline: Value): string {
    const parts: string[] = [];
    let start: SweepRow | null = null;
    let prev: SweepRow | null = null;
    const flush = () => {
        if (!start || !prev) return;
        const at = (r: SweepRow) => (r.layer < 0 ? "Emb" : layerLabel(r.layer));
        parts.push(
            `${show(start.output)} at ${at(start)}${prev.layer > start.layer ? `–${at(prev)}` : ""}`,
        );
    };
    for (const r of rows) {
        const changed = r.status === "ok" && show(r.output) !== show(baseline);
        if (changed && start && show(r.output) === show(start.output)) {
            prev = r;
            continue;
        }
        flush();
        start = changed ? r : null;
        prev = changed ? r : null;
    }
    flush();
    return parts.length ? parts.join(" · ") : "No layer changes the output.";
}

export default function SweepView({
    workspaceId,
    algorithmId,
    definition,
    savedDefinition,
    templateTokens,
    state,
    onStateChange,
    onSaveInput,
    onModeChange,
    walkthroughOpen,
    onWalkthrough,
    mobile = false,
}: SweepViewProps) {
    const modelName = definition.grid.kind === "model" ? definition.grid.model : undefined;
    const source = useTokens(modelName, state.source);
    const target = useTokens(modelName, state.target);
    const py = usePythonRuntime();
    const options = useMemo<EvaluateOptions>(
        () => ({ python: pythonResolver(py.version) }),
        [py.version],
    );
    const compared = useComparedAlgorithms({
        workspaceId,
        algorithmId,
        definition,
        savedDefinition,
        templateTokens,
    });

    const sameLength = source.tokens.length === target.tokens.length;
    const full = state.full && sameLength;
    const token =
        state.token !== null &&
        state.token < source.tokens.length &&
        state.token < target.tokens.length
            ? state.token
            : null;

    // Layers top-down, embedding row last.
    const strips = useMemo<Swept[]>(() => {
        if (token === null || full) return [];
        return compared.map((algorithm) => {
            const opts = { ...options, templateTokens: algorithm.templateTokens };
            const rows = tokenSweep(
                algorithm.definition,
                source.tokens,
                target.tokens,
                token,
                token,
                opts,
            ).reverse();
            return { algorithm, baseline: baselineOf(algorithm, target.tokens, opts), rows };
        });
    }, [compared, source.tokens, target.tokens, token, full, options]);

    const maps = useMemo(() => {
        if (!full) return [];
        return compared.map((algorithm) => {
            const opts = { ...options, templateTokens: algorithm.templateTokens };
            const cols = fullSweep(algorithm.definition, source.tokens, target.tokens, opts);
            return { algorithm, baseline: baselineOf(algorithm, target.tokens, opts), cols };
        });
    }, [compared, source.tokens, target.tokens, full, options]);

    const palette = useMemo(
        () =>
            outputPalette(
                full ? maps.map((m) => ({ baseline: m.baseline, rows: m.cols.flat() })) : strips,
            ),
        [full, maps, strips],
    );

    // ------------------------------------------------------ picking a token

    const [hint, setHint] = useState<string | null>(null);
    const [dragFrom, setDragFrom] = useState<number | null>(null);
    const dragStart = useRef<{ token: number; x: number; y: number; active: boolean } | null>(null);
    const [dragAt, setDragAt] = useState<{ x: number; y: number; over: number | null } | null>(
        null,
    );

    const pick = (t: number) => {
        setHint(null);
        onStateChange({ ...state, token: t });
    };

    useEffect(() => {
        const tokenAt = (x: number, y: number, role: Role) => {
            const el = document
                .elementFromPoint(x, y)
                ?.closest(`[data-sweep-token][data-role="${role}"]`) as HTMLElement | null;
            return el ? Number(el.dataset.sweepToken) : null;
        };
        const onMove = (e: PointerEvent) => {
            const s = dragStart.current;
            if (!s) return;
            if (!s.active && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 5) return;
            s.active = true;
            setDragFrom(s.token);
            setDragAt({
                x: e.clientX,
                y: e.clientY,
                over: tokenAt(e.clientX, e.clientY, "target"),
            });
        };
        const onUp = (e: PointerEvent) => {
            const s = dragStart.current;
            dragStart.current = null;
            setDragFrom(null);
            setDragAt(null);
            if (!s?.active) return;
            const over = tokenAt(e.clientX, e.clientY, "target");
            if (over === null) return;
            if (over !== s.token) {
                setHint(
                    `Sweeps compare the same position: drop “${tokenLabel(source.tokens[s.token] ?? "")}” (${s.token}) onto token ${s.token} of the target.`,
                );
                return;
            }
            pick(over);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        return () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };
    });

    const tokenRow = (role: Role, tokens: string[]) => (
        <div className="flex items-start gap-2">
            <span className="flex w-16 shrink-0 items-center gap-1.5 pt-1.5 text-sm font-medium">
                <span className={cn("size-2 rounded-full", ROLE_DOT[role])} aria-hidden="true" />
                {role === "source" ? "Source" : "Target"}
            </span>
            <div className="flex flex-wrap gap-1">
                {tokens.map((t, i) => {
                    const selected = token === i;
                    const hover = role === "target" && dragAt?.over === i;
                    return (
                        <button
                            key={i}
                            type="button"
                            data-sweep-token={i}
                            data-role={role}
                            onPointerDown={(e) => {
                                if (
                                    role !== "source" ||
                                    e.button !== 0 ||
                                    e.pointerType === "touch"
                                )
                                    return;
                                dragStart.current = {
                                    token: i,
                                    x: e.clientX,
                                    y: e.clientY,
                                    active: false,
                                };
                            }}
                            onClick={() => pick(i)}
                            title={`Sweep token ${i} (“${tokenLabel(t)}”) in both inputs`}
                            className={cn(
                                "flex min-w-8 flex-col items-center rounded-sm border bg-background px-1.5 py-0.5 font-mono text-xs leading-tight select-none",
                                role === "source" && "cursor-grab",
                                selected &&
                                    role === "source" &&
                                    "border-cyan-500 ring-1 ring-cyan-500",
                                selected &&
                                    role === "target" &&
                                    "border-pink-500 ring-1 ring-pink-500",
                                hover &&
                                    (dragFrom === i
                                        ? "ring-2 ring-pink-500"
                                        : "ring-2 ring-destructive"),
                                (i >= source.tokens.length || i >= target.tokens.length) &&
                                    "opacity-40",
                            )}
                        >
                            <span>{tokenLabel(t)}</span>
                            <span className="text-muted-foreground tabular-nums">{i}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );

    const loading = source.loading || target.loading;
    const lastToken = target.tokens.length - 1;

    const grids = (
        <div className="flex h-full min-h-0 flex-col">
            <div className="p-3 border-b flex items-center justify-between gap-2">
                <h2 className="text-sm pl-2 font-medium whitespace-nowrap">Algorithm Hypothesis</h2>
                <ModeTabs
                    mode="sweep"
                    onModeChange={onModeChange}
                    walkthroughOpen={walkthroughOpen}
                    onWalkthrough={onWalkthrough}
                />
            </div>
            <div className="flex flex-col gap-2 border-b px-3 py-2">
                <InputRow
                    role="source"
                    value={state.source}
                    saved={definition.inputs ?? []}
                    onChange={(s) => onStateChange({ ...state, source: s })}
                    onSave={onSaveInput}
                />
                <InputRow
                    role="target"
                    value={state.target}
                    saved={definition.inputs ?? []}
                    onChange={(t) => onStateChange({ ...state, target: t })}
                    onSave={onSaveInput}
                    extra={
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Swap source and target"
                            title="Swap source and target"
                            onClick={() =>
                                onStateChange({
                                    ...state,
                                    source: state.target,
                                    target: state.source,
                                })
                            }
                        >
                            <ArrowUpDown />
                        </Button>
                    }
                />
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-auto">
                {loading ? (
                    <p className="p-6 text-sm text-muted-foreground" aria-live="polite">
                        Tokenizing…
                    </p>
                ) : (
                    <>
                        <div className="flex flex-col gap-2 border-b px-3 py-3">
                            {tokenRow("source", source.tokens)}
                            {tokenRow("target", target.tokens)}
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs text-muted-foreground" aria-live="polite">
                                    {hint ??
                                        (full
                                            ? "Every position is swept, token t into token t."
                                            : "Drag a source token onto the same token of the target, or click a token. Each layer, from the embedding row up, runs one intervention.")}
                                </p>
                                <div
                                    className="flex items-center gap-0.5 rounded-md border p-0.5"
                                    role="group"
                                    aria-label="Sweep"
                                >
                                    {(
                                        [
                                            [false, "One token"],
                                            [true, "Full grid"],
                                        ] as const
                                    ).map(([value, label]) => (
                                        <Button
                                            key={label}
                                            size="sm"
                                            className="h-7 px-2.5"
                                            variant={full === value ? "secondary" : "ghost"}
                                            aria-pressed={full === value}
                                            disabled={value && !sameLength}
                                            title={
                                                value && !sameLength
                                                    ? "The full grid needs inputs with the same number of tokens."
                                                    : undefined
                                            }
                                            onClick={() => onStateChange({ ...state, full: value })}
                                        >
                                            {label}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="p-3">
                            {full ? (
                                <FullGrids
                                    maps={maps}
                                    palette={palette}
                                    tokens={target.tokens}
                                    layers={definition.grid.layers}
                                />
                            ) : token === null ? (
                                <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
                                    <p>Pick a token to sweep.</p>
                                    {lastToken >= 0 && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => pick(lastToken)}
                                        >
                                            Sweep the last token (“
                                            {tokenLabel(target.tokens[lastToken])}”)
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <Strips strips={strips} palette={palette} />
                            )}
                            <Legend
                                palette={palette}
                                baseline={strips[0]?.baseline ?? maps[0]?.baseline}
                            />
                        </div>
                    </>
                )}
            </div>
            {dragFrom !== null && dragAt && (
                <div
                    className="pointer-events-none fixed left-0 top-0 z-50 rounded-md border bg-popover px-2 py-1 text-xs shadow-md"
                    style={{ transform: `translate(${dragAt.x + 12}px, ${dragAt.y + 12}px)` }}
                >
                    <span className="font-mono">“{tokenLabel(source.tokens[dragFrom] ?? "")}”</span>
                    <span className="text-muted-foreground">
                        {" "}
                        → drop on token {dragFrom} of the target
                    </span>
                </div>
            )}
        </div>
    );

    const summary = (
        <div className="flex h-full min-h-0 flex-col">
            <div className="p-3 border-b flex items-center justify-between">
                <h2 className="text-sm pl-2 font-medium">Sweep</h2>
            </div>
            <div
                className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 text-sm"
                aria-live="polite"
            >
                {full ? (
                    <p className="text-muted-foreground">
                        Each map shows, for every layer and token, the counterfactual output of the
                        intervention at that cell (token t of the source into token t of the
                        target). Colored cells are where the algorithm predicts a change.
                    </p>
                ) : token === null ? (
                    <p className="text-muted-foreground">
                        A sweep runs the interchange intervention at one token, layer by layer, and
                        shows where each algorithm says the output changes. On the paper&apos;s
                        example, sweep the last token: the binding window is where the three
                        mechanisms disagree.
                    </p>
                ) : (
                    <>
                        <p className="text-xs text-muted-foreground">
                            Token {token}: “{tokenLabel(source.tokens[token] ?? "")}” in the source
                            into “{tokenLabel(target.tokens[token] ?? "")}” in the target, at every
                            layer from the embedding row to {layerLabel(definition.grid.layers - 1)}
                            .
                        </p>
                        <ul className="flex flex-col gap-3">
                            {strips.map((s) => (
                                <li key={s.algorithm.key} className="flex flex-col gap-0.5">
                                    <span className="flex items-center gap-1.5 text-xs font-medium">
                                        {s.algorithm.name}
                                        {s.algorithm.note && (
                                            <span className="font-normal text-muted-foreground">
                                                {s.algorithm.note}
                                            </span>
                                        )}
                                    </span>
                                    <span className="font-mono text-xs">
                                        {changeSummary([...s.rows].reverse(), s.baseline)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
                {py.status === "loading" && (
                    <p className="text-xs text-muted-foreground">
                        Loading Python for custom functions; their cells show “…” until it&apos;s
                        ready.
                    </p>
                )}
            </div>
        </div>
    );

    if (mobile)
        return (
            <div className="flex flex-col gap-2">
                <div className="min-h-[60vh] rounded border bg-secondary/80 dark:bg-secondary/50">
                    {grids}
                </div>
                <div className="rounded border bg-secondary/80 dark:bg-secondary/50">{summary}</div>
            </div>
        );

    return (
        <ResizablePanelGroup
            direction="horizontal"
            className="flex h-full min-w-0 flex-1 rounded border bg-secondary/80 dark:bg-secondary/50"
        >
            <ResizablePanel id="sweep" order={1} defaultSize={70} minSize={40} className="min-w-0">
                {grids}
            </ResizablePanel>
            <ResizableHandle className="w-[0.8px]" />
            <ResizablePanel
                id="sweep-summary"
                order={2}
                defaultSize={30}
                minSize={22}
                className="min-w-0"
            >
                {summary}
            </ResizablePanel>
        </ResizablePanelGroup>
    );
}

/** The algorithm's own output on the target. */
function baselineOf(
    algorithm: ComparedAlgorithm,
    targetTokens: string[],
    options: EvaluateOptions,
): Value {
    return outputOf(algorithm.definition, evaluate(algorithm.definition, targetTokens, options));
}

function Strips({ strips, palette }: { strips: Swept[]; palette: Map<string, string> }) {
    if (!strips.length) return null;
    const layers = strips[0].rows.map((r) => r.layer);
    return (
        <div className="overflow-x-auto">
            <div
                className="grid w-max gap-1"
                style={{
                    gridTemplateColumns: `3rem repeat(${strips.length}, minmax(6.5rem, max-content)) 6.5rem`,
                }}
            >
                <span />
                {strips.map((s) => (
                    <span
                        key={s.algorithm.key}
                        className="flex min-w-0 flex-col justify-end px-1 pb-1 text-xs"
                        title={s.algorithm.note}
                    >
                        <span className="flex items-center gap-1 font-medium">
                            <span className="truncate">{s.algorithm.name}</span>
                        </span>
                        <span className="truncate text-muted-foreground">
                            {s.algorithm.group === "saved" ? "saved" : "this algorithm"}
                        </span>
                    </span>
                ))}
                <span className="px-1 pb-1 text-xs text-muted-foreground">Network</span>
                {layers.map((layer, li) => (
                    <div key={layer} className="contents">
                        <span className="self-center pr-1 text-right text-xs text-muted-foreground tabular-nums">
                            {layer < 0 ? "Emb" : layerLabel(layer)}
                        </span>
                        {strips.map((s) => {
                            const row = s.rows[li];
                            const look = cellLook(row, s.baseline, palette);
                            return (
                                <span
                                    key={s.algorithm.key}
                                    title={rowTitle(s.algorithm, row)}
                                    className={cn(
                                        "flex h-7 items-center justify-center rounded-sm px-1.5 font-mono text-xs",
                                        look.className,
                                    )}
                                    style={look.style}
                                >
                                    {show(row.output)}
                                </span>
                            );
                        })}
                        {li === 0 ? (
                            <span
                                className="flex items-center justify-center rounded-sm border border-dashed px-1 text-center text-xs text-muted-foreground"
                                style={{ gridRow: `span ${layers.length}` }}
                            >
                                Patch Lens, in P7
                            </span>
                        ) : null}
                    </div>
                ))}
            </div>
        </div>
    );
}

function FullGrids({
    maps,
    palette,
    tokens,
    layers,
}: {
    maps: { algorithm: ComparedAlgorithm; baseline: Value; cols: SweepRow[][] }[];
    palette: Map<string, string>;
    tokens: string[];
    layers: number;
}) {
    const rowLayers = Array.from({ length: layers + 1 }, (_, i) => layers - 1 - i); // top … -1
    return (
        <div className="flex flex-wrap gap-6">
            {maps.map((m) => (
                <figure key={m.algorithm.key} className="flex flex-col gap-1">
                    <figcaption className="flex items-center gap-1.5 text-xs font-medium">
                        {m.algorithm.name}
                        {m.algorithm.note && (
                            <span className="font-normal text-muted-foreground">
                                {m.algorithm.note}
                            </span>
                        )}
                    </figcaption>
                    <div className="overflow-x-auto">
                        <div
                            className="grid w-max gap-px"
                            style={{
                                gridTemplateColumns: `2.5rem repeat(${tokens.length}, 1.25rem)`,
                            }}
                        >
                            {rowLayers.map((layer) => (
                                <div key={layer} className="contents">
                                    <span className="pr-1 text-right text-xs leading-5 text-muted-foreground tabular-nums">
                                        {layer < 0 ? "Emb" : layerLabel(layer)}
                                    </span>
                                    {m.cols.map((col, t) => {
                                        const row = col[layer + 1];
                                        const look = cellLook(row, m.baseline, palette);
                                        return (
                                            <span
                                                key={t}
                                                title={`${rowTitle(m.algorithm, row)} · token ${t} “${tokenLabel(tokens[t] ?? "")}”`}
                                                className={cn("h-5 rounded-sm", look.className)}
                                                style={look.style}
                                            />
                                        );
                                    })}
                                </div>
                            ))}
                            <span />
                            {tokens.map((t, i) => (
                                <span
                                    key={i}
                                    title={`${i}: ${tokenLabel(t)}`}
                                    className="pt-0.5 text-center text-xs text-muted-foreground tabular-nums"
                                >
                                    {i}
                                </span>
                            ))}
                        </div>
                    </div>
                </figure>
            ))}
        </div>
    );
}

function Legend({
    palette,
    baseline,
}: {
    palette: Map<string, string>;
    baseline: Value | undefined;
}) {
    if (baseline === undefined) return null;
    return (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
                <span className={cn("rounded-sm px-1.5 py-0.5 font-mono", UNCHANGED)}>
                    {show(baseline)}
                </span>
                unchanged (the target&apos;s own output)
            </span>
            {[...palette.entries()].map(([label, cls]) => (
                <span key={label} className="flex items-center gap-1.5">
                    <span className={cn("rounded-sm px-1.5 py-0.5 font-mono", cls)}>{label}</span>
                </span>
            ))}
            <span className="flex items-center gap-1.5">
                <span className="rounded-sm border px-1.5 py-0.5 font-mono" style={NOTHING_STYLE}>
                    ∅
                </span>
                no output
            </span>
            <span className="flex items-center gap-1.5">
                <span className={cn("rounded-sm px-1.5 py-0.5 font-mono opacity-40", UNCHANGED)}>
                    {show(baseline)}
                </span>
                faded: nothing to swap in that cell
            </span>
        </div>
    );
}

/** Defaults for a chart that hasn't swept yet. */
export function defaultSweepState(prompt: string): SweepState {
    const other = EXAMPLE_PROMPTS.find((p) => p.text !== prompt) ?? EXAMPLE_PROMPTS[1];
    return { source: other.text, target: prompt, token: null, full: false };
}
