import { create } from "zustand";
import type { LogitLensUIState } from "nnsightful";

// The widget's collapsed-section shape isn't exported by name, so derive it
// from the (exported) LogitLensUIState — structurally { start, end, collapsed? }.
export type HeatmapCollapsedSection = NonNullable<LogitLensUIState["collapsedSections"]>[number];

/**
 * Ephemeral, per-chart record of which heatmap rows (token positions) are
 * expanded (uncollapsed) in a lens tool. Clicking a generated token in the
 * prompt area expands/collapses its row; the display seeds the default —
 * everything collapsed except the last N rows. Purely session UI state, never
 * persisted, so it lives here rather than in the chart config.
 *
 * `expanded[chartId]` is a sorted list of expanded row indices, or `undefined`
 * when the chart hasn't been seeded yet (the display seeds on load and resets
 * to `undefined` on a fresh run so the default recomputes).
 */
interface LensRowExpansionState {
    expanded: Record<string, number[] | undefined>;
    /** Replace the expanded set (default seed, or sync back from the widget). */
    setExpanded: (chartId: string, rows: number[]) => void;
    /** Flip one row (keyboard / plain click). */
    toggleRow: (chartId: string, row: number) => void;
    /** Force one row expanded/collapsed — the primitive the drag "paint" uses;
     * a no-op returns the same state so dragging over unchanged rows is cheap. */
    setRow: (chartId: string, row: number, expanded: boolean) => void;
    /** Drop the seed so the display reseeds the default (e.g. on a fresh run). */
    reset: (chartId: string) => void;
}

const withRow = (rows: number[], row: number): number[] =>
    rows.includes(row) ? rows : [...rows, row].sort((a, b) => a - b);
const withoutRow = (rows: number[], row: number): number[] => rows.filter((r) => r !== row);

export const useLensRowExpansion = create<LensRowExpansionState>()((set) => ({
    expanded: {},
    setExpanded: (chartId, rows) =>
        set((s) => ({
            expanded: { ...s.expanded, [chartId]: [...rows].sort((a, b) => a - b) },
        })),
    toggleRow: (chartId, row) =>
        set((s) => {
            const cur = s.expanded[chartId] ?? [];
            const next = cur.includes(row) ? withoutRow(cur, row) : withRow(cur, row);
            return { expanded: { ...s.expanded, [chartId]: next } };
        }),
    setRow: (chartId, row, expanded) =>
        set((s) => {
            const cur = s.expanded[chartId] ?? [];
            if (expanded === cur.includes(row)) return s; // no change
            const next = expanded ? withRow(cur, row) : withoutRow(cur, row);
            return { expanded: { ...s.expanded, [chartId]: next } };
        }),
    reset: (chartId) => set((s) => ({ expanded: { ...s.expanded, [chartId]: undefined } })),
}));

/**
 * Group the collapsed (not-expanded) rows of a `total`-row heatmap into the
 * contiguous `collapsed: true` sections the widget expects. Expanded rows are
 * simply left uncovered.
 */
export function collapsedSectionsFor(
    total: number,
    expanded: Iterable<number>,
): HeatmapCollapsedSection[] {
    const exp = new Set(expanded);
    const sections: HeatmapCollapsedSection[] = [];
    let start: number | null = null;
    for (let r = 0; r < total; r++) {
        const collapsed = !exp.has(r);
        if (collapsed && start === null) start = r;
        else if (!collapsed && start !== null) {
            sections.push({ start, end: r - 1, collapsed: true });
            start = null;
        }
    }
    if (start !== null) sections.push({ start, end: total - 1, collapsed: true });
    return sections;
}

/**
 * Inverse of {@link collapsedSectionsFor}: the expanded row indices given the
 * widget's collapsed sections. A row is expanded unless it falls inside a
 * section whose `collapsed` flag is not `false`.
 */
export function expandedRowsFrom(total: number, sections: HeatmapCollapsedSection[]): number[] {
    const collapsed = new Set<number>();
    for (const sec of sections) {
        if (sec.collapsed === false) continue;
        for (let r = sec.start; r <= sec.end; r++) collapsed.add(r);
    }
    const expanded: number[] = [];
    for (let r = 0; r < total; r++) if (!collapsed.has(r)) expanded.push(r);
    return expanded;
}
