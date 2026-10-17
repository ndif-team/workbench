"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type {
    AlgorithmDefinition,
    AlgorithmView,
    Cell,
    VarType,
    Variable,
} from "@/types/algorithmHypothesis";
import {
    byId,
    readers,
    refKey,
    refsOf,
    spanEnd,
    valueAt,
    varKey,
    type Evaluation,
} from "@/lib/algorithmHypothesis/engine";
import { isError, isPending, keyOf, show } from "@/lib/algorithmHypothesis/primitives";
import { describeType } from "@/lib/algorithmHypothesis/vartypes";
import { arrowColor, chipColor, TypeGlyph } from "./glyphs";

/**
 * The layers × tokens grid, in Figure 1's orientation: tokens across, layers
 * going up. Each variable sits in its cell; dashed copies above it show the
 * layers it is carried through (its span). Arrows show what each variable reads,
 * leaving from where the value is recalled: the copy just below the reader.
 * Glyphs show each variable's type; color is the variable's own (black by
 * default), unless the grid is plain. In the editor, drag a variable to move it; its definition stays the
 * same. In "view" mode (the intervention view) the grid is read-only and its
 * cells carry data attributes the parent uses for dragging interventions.
 */

/** A cell outlined in the intervention view. Layer -1 is the token label. */
export interface CellMark {
    cell: Cell;
    tone: "source" | "target" | "counterfactual" | "invalid";
}

interface AlgorithmGridProps {
    definition: AlgorithmDefinition;
    tokens: string[];
    evaluation: Evaluation;
    /** Each variable's type (inferred, or declared for Python functions). */
    types: Map<string, VarType | null>;
    outputId: string | null;
    view: AlgorithmView;
    mode?: "edit" | "view";
    /** Every variable and arrow in black, ignoring the variables' colors. */
    plain?: boolean;
    /** For view mode: which input this grid shows (a data attribute). */
    role?: "source" | "target" | "counterfactual";
    /** For a counterfactual grid: the run it is compared with. Values that
     * differ are tinted purple. */
    baseline?: Evaluation | null;
    marks?: CellMark[];
    /** Variable whose arrows are emphasized (the one being edited). */
    selectedId?: string | null;
    /** Where the variable being edited sits. */
    pendingCell?: Cell | null;
    /** Refs of the variable being edited, ringed in the grid. */
    argKeys?: Set<string>;
    /** An argument slot is waiting for a click. */
    picking?: boolean;
    /** Variables with problems, outlined. */
    problemIds?: Set<string>;
    /** The algorithm's special tokens (such as names), underlined. */
    specialTokens?: Set<number>;
    /** Token clicks mark special tokens. */
    markingSpecials?: boolean;
    onCellClick?: (cell: Cell) => void;
    onTokenClick?: (token: number) => void;
    onVariableClick?: (id: string) => void;
    moveProblem?: (id: string, cell: Cell) => string | null;
    onMove?: (id: string, cell: Cell) => void;
    /** Alt-drag (Option on a Mac) copies a variable to the cell instead of moving it. */
    onCopyTo?: (id: string, cell: Cell) => void;
}

type Column = { token: number } | { gap: number[] };

interface ArrowPath {
    key: string;
    d: string;
    head: string;
    /** The source variable's color; undefined for a token. */
    color: string | null | undefined;
    strong: boolean;
    dimmed: boolean;
    token: boolean;
}

const NONE = new Set<string>();
const NO_TOKENS = new Set<number>();
const noop = () => {};

const MARK_RING: Record<CellMark["tone"], string> = {
    source: "ring-2 ring-cyan-500",
    target: "ring-2 ring-pink-500",
    counterfactual: "ring-2 ring-purple-600 dark:ring-purple-400",
    invalid: "ring-2 ring-destructive",
};

/** Purple, as in Patch Lens: a value the intervention changed. */
const CHANGED =
    "border-purple-400 bg-purple-100 text-purple-800 dark:border-purple-500 dark:bg-purple-950 dark:text-purple-200";

export function tokenLabel(text: string): string {
    const s = text.replace(/\n/g, "⏎");
    return s.trim() === "" ? "␣" : s.trim();
}

export const layerLabel = (layer: number) => `L${layer}`;

function displayLayers(n: number, step: number): number[] {
    const out: number[] = [];
    for (let l = 0; l < n; l++) if (l % step === 0 || l === n - 1) out.push(l);
    return out;
}

function displayColumns(n: number, focus: number[], collapse: boolean): Column[] {
    const focused = new Set(focus);
    if (!collapse || !focused.size) return Array.from({ length: n }, (_, token) => ({ token }));
    const cols: Column[] = [];
    let gap: number[] = [];
    for (let t = 0; t < n; t++) {
        if (focused.has(t)) {
            if (gap.length) cols.push({ gap });
            gap = [];
            cols.push({ token: t });
        } else gap.push(t);
    }
    if (gap.length) cols.push({ gap });
    return cols;
}

/** The shown row that stands for `layer` at a layer step; -1 (the token row)
 * stays -1. */
export function rowOf(layer: number, nLayers: number, step: number): number {
    if (layer < 0) return layer;
    let row = 0;
    for (const r of displayLayers(nLayers, step)) if (r <= layer) row = r;
    return row;
}

const sameCell = (a: Cell | null, b: Cell | null) =>
    !!a && !!b && a.layer === b.layer && a.token === b.token;

export function AlgorithmGrid({
    definition,
    tokens,
    evaluation,
    types,
    outputId,
    view,
    mode = "edit",
    plain = false,
    role,
    baseline = null,
    marks = [],
    selectedId = null,
    pendingCell = null,
    argKeys = NONE,
    picking = false,
    problemIds = NONE,
    specialTokens = NO_TOKENS,
    markingSpecials = false,
    onCellClick = noop,
    onTokenClick = noop,
    onVariableClick = noop,
    moveProblem = () => null,
    onMove = noop,
    onCopyTo = noop,
}: AlgorithmGridProps) {
    const editing = mode === "edit";
    const gridRef = useRef<HTMLDivElement>(null);
    const nLayers = definition.grid.layers;
    const layers = useMemo(() => displayLayers(nLayers, view.layerStep), [nLayers, view.layerStep]);
    const columns = useMemo(
        () => displayColumns(tokens.length, view.focus, view.collapse),
        [tokens.length, view.focus, view.collapse],
    );
    const vars = useMemo(() => byId(definition), [definition]);
    const rd = useMemo(() => readers(definition), [definition]);
    const focus = useMemo(() => new Set(view.focus), [view.focus]);

    // A shown row stands for the layers up to the next shown row.
    const bucketOf = useCallback(
        (layer: number) => {
            let b = layers[0];
            for (const r of layers) if (r <= layer) b = r;
            return b;
        },
        [layers],
    );
    const nextRow = useCallback(
        (row: number) => layers[layers.indexOf(row) + 1] ?? nLayers,
        [layers, nLayers],
    );

    // Dropping into a row keeps the variable's layer if that row covers it.
    const resolveTarget = useCallback(
        (id: string, over: Cell): Cell => {
            const v = vars.get(id);
            if (v && v.cell.layer >= over.layer && v.cell.layer < nextRow(over.layer))
                return { layer: v.cell.layer, token: over.token };
            return over;
        },
        [vars, nextRow],
    );

    // ------------------------------------------------------------ drag to move

    const dragStart = useRef<{ id: string; x: number; y: number; active: boolean } | null>(null);
    const suppressClick = useRef(false);
    const [drag, setDrag] = useState<{
        id: string;
        x: number;
        y: number;
        target: Cell | null;
        problem: string | null;
        copying: boolean;
    } | null>(null);

    useEffect(() => {
        const cellAt = (x: number, y: number): Cell | null => {
            const el = document
                .elementFromPoint(x, y)
                ?.closest("[data-cell]") as HTMLElement | null;
            if (!el || !gridRef.current?.contains(el)) return null;
            return { layer: Number(el.dataset.layer), token: Number(el.dataset.token) };
        };
        const onPointerMove = (e: PointerEvent) => {
            const s = dragStart.current;
            if (!s) return;
            if (!s.active && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 5) return;
            s.active = true;
            const over = cellAt(e.clientX, e.clientY);
            const copying = e.altKey;
            const target = over ? (copying ? over : resolveTarget(s.id, over)) : null;
            const current = vars.get(s.id)?.cell ?? null;
            const problem =
                target && !copying && !sameCell(target, current) ? moveProblem(s.id, target) : null;
            setDrag({ id: s.id, x: e.clientX, y: e.clientY, target, problem, copying });
        };
        const onPointerUp = (e: PointerEvent) => {
            const s = dragStart.current;
            dragStart.current = null;
            if (!s?.active) return;
            // The click that follows a drag must not open a panel.
            suppressClick.current = true;
            setTimeout(() => (suppressClick.current = false), 0);
            setDrag(null);
            const over = cellAt(e.clientX, e.clientY);
            if (!over) return;
            if (e.altKey) return onCopyTo(s.id, over);
            const target = resolveTarget(s.id, over);
            if (sameCell(target, vars.get(s.id)?.cell ?? null)) return;
            const problem = moveProblem(s.id, target);
            if (problem) toast.error(problem);
            else onMove(s.id, target);
        };
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        return () => {
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
        };
    }, [moveProblem, onMove, onCopyTo, resolveTarget, vars]);

    const startDrag = (e: React.PointerEvent, id: string) => {
        if (!editing || e.button !== 0 || e.pointerType === "touch") return;
        dragStart.current = { id, x: e.clientX, y: e.clientY, active: false };
    };

    // ------------------------------------------------------------------ arrows

    const [arrows, setArrows] = useState<{ paths: ArrowPath[]; w: number; h: number }>({
        paths: [],
        w: 0,
        h: 0,
    });

    const measure = useCallback(() => {
        const grid = gridRef.current;
        if (!grid) return;
        const gr = grid.getBoundingClientRect();
        const esc = (s: string) => CSS.escape(s);
        const bornChip = (id: string) =>
            grid.querySelector<HTMLElement>(`[data-chip][data-born][data-var-id="${esc(id)}"]`);
        const cellEl = (row: number, token: number) =>
            grid.querySelector<HTMLElement>(
                `[data-cell][data-layer="${row}"][data-token="${token}"]`,
            );
        const tokenEl = (t: number) => grid.querySelector<HTMLElement>(`[data-token-label="${t}"]`);
        const paths: ArrowPath[] = [];
        if (view.arrows !== "none") {
            for (const v of definition.variables) {
                const target = bornChip(v.id);
                if (!target) continue;
                // A value is read from the layer just below the reader.
                const recall = v.cell.layer - 1;
                refsOf(v).forEach((r, i) => {
                    const isToken = !("variable" in r);
                    if (
                        isToken &&
                        view.arrows === "nearby" &&
                        selectedId !== v.id &&
                        Math.abs(r.token - v.cell.token) > 2
                    )
                        return;
                    let x0: number;
                    let yStart: number;
                    let y0: number;
                    let color: string | null | undefined;
                    if (isToken) {
                        // Carried up the token's column, then read.
                        const label = tokenEl(r.token);
                        if (!label) return;
                        const a = label.getBoundingClientRect();
                        x0 = a.left + a.width / 2 - gr.left;
                        yStart = a.top - gr.top;
                        const cell = recall >= 0 ? cellEl(bucketOf(recall), r.token) : null;
                        y0 = cell ? cell.getBoundingClientRect().top - gr.top : yStart;
                    } else {
                        const src = vars.get(r.variable);
                        if (!src) return;
                        const end = spanEnd(definition, varKey(src.id), rd, vars);
                        const row = bucketOf(Math.max(src.cell.layer, Math.min(recall, end)));
                        const copy =
                            cellEl(row, src.cell.token)?.querySelector<HTMLElement>(
                                `[data-chip][data-var-id="${esc(src.id)}"]`,
                            ) ?? bornChip(src.id);
                        if (!copy) return;
                        const a = copy.getBoundingClientRect();
                        x0 = a.left + a.width / 2 - gr.left;
                        yStart = y0 = a.top - gr.top;
                        color = plain ? null : src.color;
                    }
                    const b = target.getBoundingClientRect();
                    const x1 = b.left + b.width / 2 - gr.left;
                    const y1 = b.bottom - gr.top;
                    const dy = Math.max(16, Math.abs(y1 - y0) * 0.5);
                    const c1 = [x1, y1 + dy];
                    const ang = Math.atan2(y1 - c1[1], x1 - c1[0]);
                    const s = 5;
                    const h1 = [x1 - s * Math.cos(ang - 0.45), y1 - s * Math.sin(ang - 0.45)];
                    const h2 = [x1 - s * Math.cos(ang + 0.45), y1 - s * Math.sin(ang + 0.45)];
                    const strong =
                        !!selectedId &&
                        (selectedId === v.id || ("variable" in r && r.variable === selectedId));
                    const rise = y0 !== yStart ? ` L${x0},${y0}` : "";
                    paths.push({
                        key: `${v.id}:${refKey(r)}:${i}`,
                        d: `M${x0},${yStart}${rise} C${x0},${y0 - dy} ${c1[0]},${c1[1]} ${x1},${y1}`,
                        head: `M${x1},${y1} L${h1[0]},${h1[1]} L${h2[0]},${h2[1]} Z`,
                        color,
                        strong,
                        dimmed: !!selectedId && !strong,
                        token: isToken,
                    });
                });
            }
        }
        setArrows({ paths, w: grid.scrollWidth, h: grid.scrollHeight });
    }, [definition, view.arrows, selectedId, vars, rd, bucketOf, plain]);

    useLayoutEffect(() => {
        measure();
    }, [measure, columns, layers, tokens, evaluation, view.labels]);

    useEffect(() => {
        const grid = gridRef.current;
        if (!grid) return;
        const ro = new ResizeObserver(() => measure());
        ro.observe(grid);
        return () => ro.disconnect();
    }, [measure]);

    // ------------------------------------------------------------------ render

    if (!tokens.length) {
        return (
            <div className="p-6 text-sm text-muted-foreground">
                Type a prompt above to build the grid.
            </div>
        );
    }

    const nRows = layers.length;
    const templateColumns =
        "2.75rem " +
        columns.map((c) => ("gap" in c ? "1rem" : "minmax(4rem, max-content)")).join(" ");

    const markFor = (cell: Cell) =>
        marks.find(
            (m) =>
                m.cell.token === cell.token &&
                (cell.layer < 0
                    ? m.cell.layer < 0
                    : m.cell.layer >= 0 && bucketOf(m.cell.layer) === cell.layer),
        );

    /** A variable in a row: born there, or a dashed copy carried through it. */
    const chipFor = (v: Variable, ghost: boolean, row: number) => {
        // The value as it sits at the top of this row (an intervention below it counts).
        const at = Math.min(ghost ? row : nextRow(row) - 1, nLayers - 1);
        const { value, intervened } = valueAt(definition, evaluation, varKey(v.id), at);
        const changed =
            !!baseline &&
            keyOf(valueAt(definition, baseline, varKey(v.id), at).value) !== keyOf(value);
        const type = types.get(v.id) ?? null;
        const failed = isError(value);
        const label = view.labels === "names" ? v.name : show(value);
        const hasProblem = problemIds.has(v.id);
        const isOutput = outputId === v.id;
        const color = chipColor(plain ? null : v.color);
        const title = `${v.name}: ${describeType(type)} = ${show(value)}${isOutput ? " (output)" : ""}${
            v.tags?.length ? ` · ${v.tags.join(", ")}` : ""
        }${failed ? `\n${value.message}` : ""}${isPending(value) ? "\nPython is running…" : ""}${
            intervened ? "\nSwapped in from the source." : ""
        }${hasProblem ? " (has problems; open it to see them)" : ""}`;
        const className = cn(
            "flex items-center gap-1 min-w-0 rounded-sm border bg-background px-1 py-0.5 font-mono text-xs leading-none",
            color.className,
            isOutput && !ghost && "font-semibold",
            ghost && "border-dashed bg-transparent opacity-60",
            (changed || intervened) && CHANGED,
            (changed || intervened) && ghost && "opacity-80",
            intervened && !ghost && "ring-1 ring-purple-600 dark:ring-purple-400",
            failed && "border-destructive text-destructive dark:border-destructive",
            editing && !ghost && !picking && "cursor-grab active:cursor-grabbing",
            editing && picking && "cursor-copy",
            selectedId === v.id && "ring-2 ring-primary",
            selectedId !== v.id && argKeys.has(varKey(v.id)) && "ring-2 ring-primary/50",
            hasProblem && !ghost && "border-destructive dark:border-destructive",
            drag?.id === v.id && !ghost && "opacity-40",
        );
        const style = changed || intervened || failed ? undefined : color.style;
        const body = (
            <>
                <TypeGlyph type={type} className="size-2.5" />
                <span className="truncate">{label}</span>
            </>
        );
        if (!editing)
            return (
                <span
                    key={`${v.id}${ghost ? ":ghost" : ""}`}
                    data-chip=""
                    data-var-id={v.id}
                    data-born={ghost ? undefined : ""}
                    title={title}
                    className={className}
                    style={style}
                >
                    {body}
                </span>
            );
        return (
            <button
                key={`${v.id}${ghost ? ":ghost" : ""}`}
                type="button"
                data-chip=""
                data-var-id={v.id}
                data-born={ghost ? undefined : ""}
                onPointerDown={ghost ? undefined : (e) => startDrag(e, v.id)}
                onClick={(e) => {
                    e.stopPropagation();
                    if (suppressClick.current) return;
                    onVariableClick(v.id);
                }}
                title={title}
                className={className}
                style={style}
            >
                {body}
            </button>
        );
    };

    /** The token itself was swapped by an intervention on the embedding row. */
    const swappedToken = (t: number) =>
        !editing && valueAt(definition, evaluation, `t:${t}`, -1).intervened;

    const dragVar = drag ? vars.get(drag.id) : undefined;

    return (
        <div className="relative">
            <div
                ref={gridRef}
                data-grid-role={role}
                className="relative grid w-max gap-1 p-3"
                style={{
                    gridTemplateColumns: templateColumns,
                    gridTemplateRows: `repeat(${nRows}, minmax(2rem, auto)) auto`,
                }}
            >
                {layers.map((l, li) => (
                    <div
                        key={`layer-${l}`}
                        className="self-center pr-1.5 text-right text-xs text-muted-foreground tabular-nums whitespace-nowrap"
                        style={{ gridColumn: 1, gridRow: nRows - li }}
                    >
                        {layerLabel(l)}
                        {nextRow(l) - 1 > l && (
                            <span className="text-muted-foreground/60">–{nextRow(l) - 1}</span>
                        )}
                    </div>
                ))}

                {columns.map((c, ci) =>
                    "gap" in c ? (
                        <div
                            key={`gap-${ci}`}
                            className="flex items-center justify-center rounded-sm border-x border-dashed text-xs text-muted-foreground"
                            style={{ gridColumn: ci + 2, gridRow: `1 / span ${nRows + 1}` }}
                            title={`Hidden: ${c.gap.map((t) => tokenLabel(tokens[t])).join(" ")}`}
                        >
                            …
                        </div>
                    ) : (
                        <button
                            key={`tok-${c.token}`}
                            type="button"
                            data-token-label={c.token}
                            data-cell={editing ? undefined : ""}
                            data-layer={editing ? undefined : -1}
                            data-token={editing ? undefined : c.token}
                            onClick={() => onTokenClick(c.token)}
                            title={
                                !editing
                                    ? `Embedding row: the token “${tokenLabel(tokens[c.token])}” itself`
                                    : markingSpecials
                                      ? `${specialTokens.has(c.token) ? "Unmark" : "Mark"} “${tokenLabel(tokens[c.token])}” as a special token`
                                      : picking
                                        ? `Add “${tokenLabel(tokens[c.token])}” as an argument`
                                        : `${focus.has(c.token) ? "Unfocus" : "Focus"} “${tokenLabel(tokens[c.token])}”`
                            }
                            className={cn(
                                "flex min-w-0 flex-col items-center rounded-sm px-0.5 pt-1 pb-0.5 font-mono text-xs leading-tight hover:bg-accent",
                                editing && focus.has(c.token) && "bg-primary/10 text-primary",
                                specialTokens.has(c.token) &&
                                    "font-semibold underline decoration-2 underline-offset-4",
                                markingSpecials && "cursor-pointer ring-1 ring-primary/40",
                                argKeys.has(`t:${c.token}`) && "ring-2 ring-primary/50",
                                picking && "cursor-copy",
                                !editing && "cursor-pointer select-none",
                                swappedToken(c.token) && CHANGED,
                                markFor({ layer: -1, token: c.token }) &&
                                    MARK_RING[markFor({ layer: -1, token: c.token })!.tone],
                            )}
                            style={{ gridColumn: ci + 2, gridRow: nRows + 1 }}
                        >
                            <span className="max-w-full truncate">
                                {tokenLabel(
                                    swappedToken(c.token)
                                        ? show(
                                              valueAt(definition, evaluation, `t:${c.token}`, -1)
                                                  .value,
                                          )
                                        : tokens[c.token],
                                )}
                            </span>
                            <span className="text-muted-foreground tabular-nums">{c.token}</span>
                        </button>
                    ),
                )}

                {layers.map((row, li) => {
                    const next = nextRow(row);
                    return columns.map((c, ci) => {
                        if ("gap" in c) return null;
                        const t = c.token;
                        const born = definition.variables.filter(
                            (v) => v.cell.token === t && v.cell.layer >= row && v.cell.layer < next,
                        );
                        const carried = definition.variables.filter(
                            (v) =>
                                v.cell.token === t &&
                                v.cell.layer < row &&
                                spanEnd(definition, varKey(v.id), rd, vars) >= row,
                        );
                        const isPendingCell =
                            !!pendingCell &&
                            pendingCell.token === t &&
                            bucketOf(pendingCell.layer) === row;
                        const isDropTarget =
                            !!drag?.target &&
                            drag.target.token === t &&
                            bucketOf(drag.target.layer) === row;
                        const empty = !born.length && !carried.length;
                        const cell = { layer: row, token: t };
                        return (
                            <div
                                key={`cell-${row}-${t}`}
                                data-cell=""
                                data-layer={row}
                                data-token={t}
                                role="button"
                                tabIndex={0}
                                aria-label={`${layerLabel(row)}, token ${tokenLabel(tokens[t])} (${t})${
                                    born.length ? `: ${born.map((v) => v.name).join(", ")}` : ""
                                }`}
                                onClick={() => {
                                    if (!suppressClick.current) onCellClick(cell);
                                }}
                                onKeyDown={(e) => {
                                    if (e.target !== e.currentTarget) return;
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        onCellClick(cell);
                                    }
                                }}
                                className={cn(
                                    "flex min-h-8 min-w-0 flex-col justify-center gap-0.5 rounded-sm border p-0.5",
                                    empty
                                        ? cn(
                                              "border-transparent bg-muted/60",
                                              editing && "hover:bg-primary/10",
                                          )
                                        : "bg-card",
                                    !editing && "cursor-pointer select-none",
                                    picking && empty && "hover:bg-muted/60 cursor-default",
                                    isPendingCell && "ring-2 ring-primary",
                                    isDropTarget &&
                                        (drag?.problem
                                            ? "ring-2 ring-destructive"
                                            : "ring-2 ring-primary"),
                                    markFor(cell) && MARK_RING[markFor(cell)!.tone],
                                )}
                                style={{ gridColumn: ci + 2, gridRow: nRows - li }}
                            >
                                {born.map((v) => chipFor(v, false, row))}
                                {carried.map((v) => chipFor(v, true, row))}
                            </div>
                        );
                    });
                })}

                <svg
                    className="pointer-events-none absolute left-0 top-0 overflow-visible"
                    width={arrows.w}
                    height={arrows.h}
                    aria-hidden="true"
                >
                    {arrows.paths.map((p) => {
                        const c = p.token
                            ? { stroke: "stroke-muted-foreground", fill: "fill-muted-foreground" }
                            : arrowColor(p.color);
                        return (
                            <g
                                key={p.key}
                                className={cn(
                                    "transition-opacity",
                                    p.dimmed
                                        ? "opacity-15"
                                        : p.strong
                                          ? "opacity-100"
                                          : p.token
                                            ? "opacity-70"
                                            : "opacity-50",
                                )}
                            >
                                <path
                                    d={p.d}
                                    className={cn("fill-none", c.stroke)}
                                    style={"strokeStyle" in c ? c.strokeStyle : undefined}
                                    strokeWidth={p.strong ? 2 : 1.4}
                                    strokeDasharray={p.token ? "3 3" : undefined}
                                />
                                <path
                                    d={p.head}
                                    className={c.fill}
                                    style={"fillStyle" in c ? c.fillStyle : undefined}
                                />
                            </g>
                        );
                    })}
                </svg>
            </div>

            {drag && dragVar && (
                <div
                    className="pointer-events-none fixed left-0 top-0 z-50 rounded-md border bg-popover px-2 py-1 text-xs shadow-md"
                    style={{ transform: `translate(${drag.x + 12}px, ${drag.y + 12}px)` }}
                >
                    {drag.copying && <span className="text-muted-foreground">Copy </span>}
                    <span className="font-mono">{dragVar.name}</span>
                    {drag.target && (
                        <span className="text-muted-foreground">
                            {" "}
                            → {layerLabel(drag.target.layer)} ·{" "}
                            {tokenLabel(tokens[drag.target.token] ?? "")}
                        </span>
                    )}
                    {drag.problem && (
                        <p className="mt-0.5 max-w-64 text-destructive">{drag.problem}</p>
                    )}
                </div>
            )}
        </div>
    );
}
