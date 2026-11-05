"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import type {
    AlgorithmDefinition,
    AlgorithmHypothesisChartData,
    AlgorithmHypothesisMode,
    AlgorithmView,
    Cell,
    InterventionSpec,
    VarType,
} from "@/types/algorithmHypothesis";
import {
    byId,
    evaluate,
    interchangeIntervention,
    nodesAt,
    outputOf,
    valueAt,
    type EvaluateOptions,
} from "@/lib/algorithmHypothesis/engine";
import { isError, isPending, keyOf, show, type Value } from "@/lib/algorithmHypothesis/primitives";
import { pythonResolver, usePythonRuntime } from "@/lib/algorithmHypothesis/python";
import { EXAMPLE_PROMPTS } from "@/lib/algorithmHypothesis/grids";
import { useComparedAlgorithms, type ComparedAlgorithm } from "./comparison";
import { GridHeading, InputRow, useTokens, type Role } from "./inputs";
import { AlgorithmGrid, rowOf, tokenLabel, type CellMark } from "./AlgorithmGrid";
import { ModeTabs } from "./ModeTabs";

/**
 * Visualizer 1 (design doc §6): drag a cell of the source grid onto a cell of
 * the target grid, or click one and then the other, to run an interchange
 * intervention on the algorithm. The counterfactual grid tints the values it
 * changed purple, and the summary runs the same intervention on every
 * saved algorithm in the workspace.
 */

export type InterventionState = NonNullable<AlgorithmHypothesisChartData["intervention"]>;

interface InterventionViewProps {
    workspaceId: string;
    algorithmId: string;
    definition: AlgorithmDefinition;
    /** The algorithm's saved version, or null for a draft. */
    savedDefinition: AlgorithmDefinition | null;
    types: Map<string, VarType | null>;
    view: AlgorithmView;
    templateTokens: string[];
    state: InterventionState;
    onStateChange: (state: InterventionState) => void;
    onSaveInput: (text: string) => void;
    onModeChange: (mode: AlgorithmHypothesisMode) => void;
    walkthroughOpen: boolean;
    onWalkthrough: () => void;
    mobile?: boolean;
}

const cellText = (cell: Cell, tokens: string[]) =>
    `${cell.layer < 0 ? "Emb" : `L${cell.layer}`} · “${tokenLabel(tokens[cell.token] ?? "?")}” (${cell.token})`;

const specCells = (spec: InterventionSpec) => ({
    source: { layer: spec.sourceLayer, token: spec.sourceToken },
    target: { layer: spec.targetLayer, token: spec.targetToken },
});

/** Why an intervention between these cells swaps nothing, or null. */
function pairProblem(def: AlgorithmDefinition, from: Cell, to: Cell): string | null {
    const s = nodesAt(def, from.layer, from.token);
    const t = nodesAt(def, to.layer, to.token);
    if (!s.length) return "Nothing lives in that source cell.";
    if (!t.length) return "Nothing lives in that target cell.";
    if (!t.some((k) => s.includes(k)))
        return "No variables in common. Interventions only swap variables with the same name.";
    return null;
}

export default function InterventionView({
    workspaceId,
    algorithmId,
    definition,
    savedDefinition,
    types,
    view,
    templateTokens,
    state,
    onStateChange,
    onSaveInput,
    onModeChange,
    walkthroughOpen,
    onWalkthrough,
    mobile = false,
}: InterventionViewProps) {
    const modelName = definition.grid.kind === "model" ? definition.grid.model : undefined;
    const source = useTokens(modelName, state.source);
    const target = useTokens(modelName, state.target);
    const py = usePythonRuntime();
    const options = useMemo<EvaluateOptions>(
        () => ({ templateTokens, python: pythonResolver(py.version) }),
        [templateTokens, py.version],
    );

    const specials = useMemo(
        () => new Set(definition.specialTokens ?? []),
        [definition.specialTokens],
    );
    const spec = state.spec;
    const cells = spec ? specCells(spec) : null;
    const compared = useComparedAlgorithms({
        workspaceId,
        algorithmId,
        definition,
        savedDefinition,
        templateTokens,
        enabled: !!spec,
    });
    const sourceRun = useMemo(
        () => evaluate(definition, source.tokens, options),
        [definition, source.tokens, options],
    );
    const targetRun = useMemo(
        () => evaluate(definition, target.tokens, options),
        [definition, target.tokens, options],
    );
    const result = useMemo(
        () =>
            cells
                ? interchangeIntervention(
                      definition,
                      source.tokens,
                      target.tokens,
                      cells.source,
                      cells.target,
                      options,
                  )
                : null,
        // `cells` is rebuilt from `spec` on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [definition, source.tokens, target.tokens, spec, options],
    );

    // ------------------------------------------------- picking and dragging

    const contentRef = useRef<HTMLDivElement>(null);
    const [picked, setPicked] = useState<Cell | null>(null);
    const [hint, setHint] = useState<string | null>(null);
    const dragStart = useRef<{ from: Cell; x: number; y: number; active: boolean } | null>(null);
    const suppressClick = useRef(false);
    const [drag, setDrag] = useState<{
        from: Cell;
        x: number;
        y: number;
        over: Cell | null;
        problem: string | null;
    } | null>(null);

    const apply = useCallback(
        (from: Cell, to: Cell) => {
            setPicked(null);
            setHint(null);
            onStateChange({
                ...state,
                spec: {
                    sourceLayer: from.layer,
                    sourceToken: from.token,
                    targetLayer: to.layer,
                    targetToken: to.token,
                },
            });
        },
        [state, onStateChange],
    );

    const cellAt = (el: Element | null, role: Role): Cell | null => {
        const c = el?.closest("[data-cell]") as HTMLElement | null;
        const grid = c?.closest("[data-grid-role]") as HTMLElement | null;
        if (!c || !grid || grid.dataset.gridRole !== role) return null;
        return { layer: Number(c.dataset.layer), token: Number(c.dataset.token) };
    };

    useEffect(() => {
        const onMove = (e: PointerEvent) => {
            const s = dragStart.current;
            if (!s) return;
            if (!s.active && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 5) return;
            s.active = true;
            const over = cellAt(document.elementFromPoint(e.clientX, e.clientY), "target");
            setDrag({
                from: s.from,
                x: e.clientX,
                y: e.clientY,
                over,
                problem: over ? pairProblem(definition, s.from, over) : null,
            });
        };
        const onUp = (e: PointerEvent) => {
            const s = dragStart.current;
            dragStart.current = null;
            if (!s?.active) return;
            suppressClick.current = true;
            setTimeout(() => (suppressClick.current = false), 0);
            setDrag(null);
            const over = cellAt(document.elementFromPoint(e.clientX, e.clientY), "target");
            if (over) apply(s.from, over);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        return () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };
    }, [definition, apply]);

    const onSourcePointerDown = (e: React.PointerEvent) => {
        if (e.button !== 0 || e.pointerType === "touch") return;
        const from = cellAt(e.target as Element, "source");
        if (from) dragStart.current = { from, x: e.clientX, y: e.clientY, active: false };
    };

    const onSourceClick = (cell: Cell) => {
        if (suppressClick.current) return;
        const same = picked && picked.layer === cell.layer && picked.token === cell.token;
        setPicked(same ? null : cell);
        setHint(same ? null : "Now click a cell of the target grid.");
    };
    const onTargetClick = (cell: Cell) => {
        if (suppressClick.current) return;
        if (picked) apply(picked, cell);
        else setHint("Pick a source cell first: drag it here, or click it and then a target cell.");
    };

    // ------------------------------------------------------ intervention arrow

    const [arrow, setArrow] = useState<{ d: string; a: number[]; b: number[] } | null>(null);
    const measure = useCallback(() => {
        const root = contentRef.current;
        if (!root || !cells) return setArrow(null);
        const find = (role: Role, cell: Cell) =>
            root.querySelector<HTMLElement>(
                cell.layer < 0
                    ? `[data-grid-role="${role}"] [data-token-label="${cell.token}"]`
                    : `[data-grid-role="${role}"] [data-cell][data-layer="${rowOf(cell.layer, definition.grid.layers, view.layerStep)}"][data-token="${cell.token}"]`,
            );
        const from = find("source", cells.source);
        const to = find("target", cells.target);
        if (!from || !to) return setArrow(null);
        const r0 = root.getBoundingClientRect();
        const a = from.getBoundingClientRect();
        const b = to.getBoundingClientRect();
        const x0 = a.left + a.width / 2 - r0.left;
        const y0 = a.top + a.height / 2 - r0.top;
        const x1 = b.left + b.width / 2 - r0.left;
        const y1 = b.top + b.height / 2 - r0.top;
        const bulge = Math.max(48, Math.abs(x1 - x0) * 0.25);
        setArrow({
            d: `M${x0},${y0} C${x0 + bulge},${y0 + (y1 - y0) * 0.3} ${x1 + bulge},${y1 - (y1 - y0) * 0.3} ${x1},${y1}`,
            a: [x0, y0],
            b: [x1, y1],
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [spec, definition.grid.layers, view.layerStep]);

    useLayoutEffect(() => {
        measure();
    }, [measure, source.tokens, target.tokens, result, view]);
    useEffect(() => {
        const root = contentRef.current;
        if (!root) return;
        const ro = new ResizeObserver(() => measure());
        ro.observe(root);
        return () => ro.disconnect();
    }, [measure]);

    // ------------------------------------------------------------- marks

    const sourceMarks: CellMark[] = [];
    const targetMarks: CellMark[] = [];
    const cfMarks: CellMark[] = [];
    const from = drag?.from ?? picked;
    if (from) sourceMarks.push({ cell: from, tone: "source" });
    else if (cells) sourceMarks.push({ cell: cells.source, tone: "source" });
    if (drag?.over)
        targetMarks.push({ cell: drag.over, tone: drag.problem ? "invalid" : "target" });
    else if (cells) targetMarks.push({ cell: cells.target, tone: "target" });
    if (cells && result?.ok) cfMarks.push({ cell: cells.target, tone: "counterfactual" });

    const loading = source.loading || target.loading;
    const tokensDiffer =
        !loading &&
        definition.variables.length > 0 &&
        (source.tokens.length !== templateTokens.length ||
            target.tokens.length !== templateTokens.length);

    // -------------------------------------------------------------- render

    const grids = (
        <div className="flex h-full min-h-0 flex-col">
            <div className="p-3 border-b flex items-center justify-between gap-2">
                <h2 className="text-sm pl-2 font-medium whitespace-nowrap">Algorithm Hypothesis</h2>
                <ModeTabs
                    mode="intervene"
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
                    onChange={(source) => onStateChange({ ...state, source })}
                    onSave={onSaveInput}
                />
                <InputRow
                    role="target"
                    value={state.target}
                    saved={definition.inputs ?? []}
                    onChange={(target) => onStateChange({ ...state, target })}
                    onSave={onSaveInput}
                    extra={
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Swap source and target"
                            title="Swap source and target"
                            onClick={() =>
                                onStateChange({
                                    source: state.target,
                                    target: state.source,
                                    spec: state.spec && {
                                        sourceLayer: state.spec.targetLayer,
                                        sourceToken: state.spec.targetToken,
                                        targetLayer: state.spec.sourceLayer,
                                        targetToken: state.spec.sourceToken,
                                    },
                                })
                            }
                        >
                            <ArrowUpDown />
                        </Button>
                    }
                />
                <p className="text-xs text-muted-foreground" aria-live="polite">
                    {hint ??
                        "Drag a cell of the source grid onto a cell of the target grid, or click one and then the other. The token row is the embedding layer: the token itself."}
                </p>
            </div>
            {tokensDiffer && (
                <p className="border-b px-4 py-2 text-xs text-amber-700 dark:text-amber-400">
                    The source and target should have the template&apos;s {templateTokens.length}{" "}
                    tokens; variables are anchored by token position.
                </p>
            )}
            <div className="min-h-0 flex-1 overflow-auto">
                {loading ? (
                    <p className="p-6 text-sm text-muted-foreground" aria-live="polite">
                        Tokenizing…
                    </p>
                ) : (
                    <div ref={contentRef} className="relative w-max min-w-full pb-3">
                        <GridHeading
                            role="source"
                            label="Source"
                            text={state.source}
                            output={outputOf(definition, sourceRun)}
                        />
                        <div onPointerDown={onSourcePointerDown}>
                            <AlgorithmGrid
                                mode="view"
                                plain
                                role="source"
                                definition={definition}
                                tokens={source.tokens}
                                evaluation={sourceRun}
                                types={types}
                                outputId={definition.output}
                                view={view}
                                specialTokens={specials}
                                marks={sourceMarks}
                                onCellClick={onSourceClick}
                                onTokenClick={(t) => onSourceClick({ layer: -1, token: t })}
                            />
                        </div>
                        <GridHeading
                            role="target"
                            label="Target"
                            text={state.target}
                            output={outputOf(definition, targetRun)}
                        />
                        <AlgorithmGrid
                            mode="view"
                            plain
                            role="target"
                            definition={definition}
                            tokens={target.tokens}
                            evaluation={targetRun}
                            types={types}
                            outputId={definition.output}
                            view={view}
                            specialTokens={specials}
                            marks={targetMarks}
                            onCellClick={onTargetClick}
                            onTokenClick={(t) => onTargetClick({ layer: -1, token: t })}
                        />
                        <GridHeading
                            role="counterfactual"
                            label="Counterfactual"
                            text="The target run after the intervention. Purple values changed."
                            output={result?.ok ? result.output : undefined}
                        />
                        <AlgorithmGrid
                            mode="view"
                            plain
                            role="counterfactual"
                            definition={definition}
                            tokens={target.tokens}
                            evaluation={result?.counterfactual ?? targetRun}
                            baseline={result?.counterfactual ? targetRun : null}
                            types={types}
                            outputId={definition.output}
                            view={view}
                            specialTokens={specials}
                            marks={cfMarks}
                        />
                        {arrow && (
                            <svg
                                className="pointer-events-none absolute left-0 top-0 size-full overflow-visible"
                                aria-hidden="true"
                            >
                                <path
                                    d={arrow.d}
                                    className="fill-none stroke-purple-600 dark:stroke-purple-400"
                                    strokeWidth={2}
                                    strokeDasharray="6 4"
                                />
                                <circle
                                    cx={arrow.a[0]}
                                    cy={arrow.a[1]}
                                    r={4}
                                    className="fill-cyan-500"
                                />
                                <circle
                                    cx={arrow.b[0]}
                                    cy={arrow.b[1]}
                                    r={4}
                                    className="fill-pink-500"
                                />
                            </svg>
                        )}
                    </div>
                )}
            </div>
            {drag && (
                <div
                    className="pointer-events-none fixed left-0 top-0 z-50 max-w-72 rounded-md border bg-popover px-2 py-1 text-xs shadow-md"
                    style={{ transform: `translate(${drag.x + 12}px, ${drag.y + 12}px)` }}
                >
                    <span className="font-mono">{cellText(drag.from, source.tokens)}</span>
                    {drag.over ? (
                        <span className="text-muted-foreground">
                            {" "}
                            → {cellText(drag.over, target.tokens)}
                        </span>
                    ) : (
                        <span className="text-muted-foreground"> → drop on the target grid</span>
                    )}
                    {drag.problem && <p className="mt-0.5 text-destructive">{drag.problem}</p>}
                </div>
            )}
        </div>
    );

    const summary = (
        <InterventionSummary
            compared={compared}
            definition={definition}
            sourceTokens={source.tokens}
            targetTokens={target.tokens}
            options={options}
            spec={spec}
            result={result}
            pythonLoading={py.status === "loading"}
            onClear={() => onStateChange({ ...state, spec: null })}
        />
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
            <ResizablePanel id="grids" order={1} defaultSize={70} minSize={40} className="min-w-0">
                {grids}
            </ResizablePanel>
            <ResizableHandle className="w-[0.8px]" />
            <ResizablePanel
                id="summary"
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

// ----------------------------------------------------------------- summary

interface SummaryRow {
    algorithm: ComparedAlgorithm;
    target: Value;
    /** Whether anything was swapped; the counterfactual can itself be ∅. */
    ok: boolean;
    counterfactual: Value;
    reason: string | null;
}

const GROUP_LABEL: Record<ComparedAlgorithm["group"], string | null> = {
    this: null,
    saved: "Saved algorithms",
};

function InterventionSummary({
    compared,
    definition,
    sourceTokens,
    targetTokens,
    options,
    spec,
    result,
    pythonLoading,
    onClear,
}: {
    compared: ComparedAlgorithm[];
    definition: AlgorithmDefinition;
    sourceTokens: string[];
    targetTokens: string[];
    options: EvaluateOptions;
    spec: InterventionSpec | null;
    result: ReturnType<typeof interchangeIntervention> | null;
    pythonLoading: boolean;
    onClear: () => void;
}) {
    const rows = useMemo<SummaryRow[]>(() => {
        if (!spec) return [];
        const { source, target } = specCells(spec);
        return compared.map((algorithm) => {
            const r = interchangeIntervention(
                algorithm.definition,
                sourceTokens,
                targetTokens,
                source,
                target,
                { ...options, templateTokens: algorithm.templateTokens },
            );
            return {
                algorithm,
                target: outputOf(algorithm.definition, r.target),
                ok: r.ok,
                counterfactual: r.output,
                reason: r.reason,
            };
        });
    }, [spec, compared, sourceTokens, targetTokens, options]);

    const vars = byId(definition);
    const cells = spec ? specCells(spec) : null;
    const swapped =
        result?.ok && result.source && cells
            ? result.swapped.map((k) => {
                  const name = k.startsWith("v:")
                      ? (vars.get(k.slice(2))?.name ?? k)
                      : `token ${k.slice(2)}`;
                  return {
                      key: k,
                      name,
                      from: valueAt(definition, result.target, k, cells.target.layer).value,
                      to: valueAt(definition, result.source!, k, cells.source.layer).value,
                  };
              })
            : [];

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="p-3 border-b flex items-center justify-between">
                <h2 className="text-sm pl-2 font-medium">Intervention</h2>
                {spec && (
                    <Button variant="ghost" size="sm" onClick={onClear}>
                        Clear
                    </Button>
                )}
            </div>
            <div
                className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 text-sm"
                aria-live="polite"
            >
                {!spec || !cells || !result ? (
                    <p className="text-muted-foreground">
                        Drag a cell of the source grid onto a cell of the target grid. The
                        counterfactual output appears here, next to what every saved algorithm in
                        this workspace predicts for the same intervention.
                    </p>
                ) : (
                    <>
                        <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">
                                Target output → counterfactual output
                            </span>
                            <span className="font-mono text-2xl">
                                {show(outputOf(definition, result.target))}
                                <span className="px-2 text-muted-foreground">→</span>
                                <span
                                    className={cn(
                                        result.ok
                                            ? "text-purple-700 dark:text-purple-300"
                                            : "text-muted-foreground",
                                    )}
                                >
                                    {result.ok ? show(result.output) : "—"}
                                </span>
                            </span>
                            <span className="text-xs text-muted-foreground">
                                Source {cellText(cells.source, sourceTokens)} → target{" "}
                                {cellText(cells.target, targetTokens)}
                            </span>
                            {!result.ok && result.reason && (
                                <p className="text-xs text-amber-700 dark:text-amber-400">
                                    {result.reason}
                                </p>
                            )}
                        </div>

                        {swapped.length > 0 && (
                            <div className="flex flex-col gap-1.5">
                                <span className="text-xs font-medium">Swapped values</span>
                                <ul className="flex flex-col gap-1 font-mono text-xs">
                                    {swapped.map((s) => (
                                        <li key={s.key}>
                                            {s.name}: {show(s.from)} →{" "}
                                            <span
                                                className={cn(
                                                    keyOf(s.from) !== keyOf(s.to) &&
                                                        "text-purple-700 dark:text-purple-300",
                                                )}
                                            >
                                                {show(s.to)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="flex flex-col gap-1.5">
                            <span className="text-xs font-medium">
                                Same intervention, every algorithm
                            </span>
                            <table className="w-full text-xs">
                                <tbody>
                                    {rows.flatMap((r, i) => {
                                        const a = r.algorithm;
                                        const label =
                                            i === 0 || rows[i - 1].algorithm.group !== a.group
                                                ? GROUP_LABEL[a.group]
                                                : null;
                                        const row = (
                                            <tr key={a.key} className="border-t first:border-t-0">
                                                <td className="py-1.5 pr-2 align-top">
                                                    <span className="flex items-center gap-1.5">
                                                        <span className="truncate">{a.name}</span>
                                                        {a.note && (
                                                            <span className="text-muted-foreground">
                                                                {a.note}
                                                            </span>
                                                        )}
                                                    </span>
                                                </td>
                                                <td className="py-1.5 text-right font-mono align-top whitespace-nowrap">
                                                    {!r.ok ? (
                                                        <span
                                                            className="font-sans text-muted-foreground"
                                                            title={r.reason ?? undefined}
                                                        >
                                                            no swap
                                                        </span>
                                                    ) : (
                                                        <>
                                                            {show(r.target)} →{" "}
                                                            <span
                                                                className={cn(
                                                                    isError(r.counterfactual)
                                                                        ? "text-destructive"
                                                                        : keyOf(
                                                                              r.counterfactual,
                                                                          ) !== keyOf(r.target) &&
                                                                              "text-purple-700 dark:text-purple-300",
                                                                )}
                                                            >
                                                                {show(r.counterfactual)}
                                                            </span>
                                                        </>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                        return label
                                            ? [
                                                  <tr key={`${a.group}-label`}>
                                                      <th
                                                          colSpan={2}
                                                          className="pt-3 pb-1 text-left font-medium text-muted-foreground"
                                                      >
                                                          {label}
                                                      </th>
                                                  </tr>,
                                                  row,
                                              ]
                                            : [row];
                                    })}
                                </tbody>
                            </table>
                            <p className="text-xs text-muted-foreground">
                                Saved algorithms use their saved version; save an algorithm in Edit
                                to add it here. “No swap”: the two cells share no variable in that
                                algorithm.
                            </p>
                        </div>
                    </>
                )}
                {pythonLoading && (
                    <p className="text-xs text-muted-foreground">
                        Loading Python for custom functions. Values that depend on them show “…”
                        until it&apos;s ready.
                    </p>
                )}
                {rows.some((r) => isPending(r.counterfactual ?? null)) && !pythonLoading && (
                    <p className="text-xs text-muted-foreground">Running Python…</p>
                )}
            </div>
        </div>
    );
}

/** Defaults for a chart that hasn't intervened yet. */
export function defaultInterventionState(prompt: string): InterventionState {
    const other = EXAMPLE_PROMPTS.find((p) => p.text !== prompt) ?? EXAMPLE_PROMPTS[1];
    return { source: other.text, target: prompt, spec: null };
}
