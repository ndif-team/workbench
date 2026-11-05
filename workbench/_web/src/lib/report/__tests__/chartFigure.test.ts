import { describe, expect, it } from "bun:test";
import {
    chartFigure,
    chartFigureGapText,
    chartPrompt,
    rowWindowLabel,
    withoutLinePlot,
} from "../chartFigure";

const LENS_DATA = { meta: { version: 2 }, layers: [0, 1], input: ["a"], tracked: [], topk: [] };
const AP_DATA = {
    lines: [[0.1, 0.2]],
    ranks: [[1, 0]],
    prob_diffs: [[0, 0.1]],
    tokenLabels: [" a"],
};

describe("chartFigure", () => {
    it("draws a logit lens or j-lens chart from its saved UI state", () => {
        const uiState = { pinnedRows: [{ pos: 0, line: "solid" }] };
        for (const type of ["logit-lens", "jlens"]) {
            expect(chartFigure({ type, data: LENS_DATA }, { type, data: { uiState } })).toEqual({
                spec: { kind: "logit-lens", data: LENS_DATA, uiState },
            } as never);
        }
    });

    it("reads a legacy lens2 chart as a logit lens, with no UI state saved", () => {
        expect(chartFigure({ type: "lens2", data: LENS_DATA }, null).spec).toEqual({
            kind: "logit-lens",
            data: LENS_DATA,
            uiState: null,
        } as never);
    });

    it("draws activation patching in its saved mode and token selection", () => {
        const spec = chartFigure(
            { type: "activation-patching", data: AP_DATA },
            {
                type: "activation-patching",
                data: { selectedMode: "rank", selectedLineIndices: [0] },
            },
        ).spec;
        expect(spec).toMatchObject({
            kind: "activation-patching",
            mode: "rank",
            selectedTokens: [0],
        });
    });

    it("falls back to the probability mode for an unknown saved mode", () => {
        const spec = chartFigure(
            { type: "activation-patching", data: AP_DATA },
            { type: "activation-patching", data: { selectedMode: "bogus" } },
        ).spec;
        expect(spec).toMatchObject({ mode: "probability", selectedTokens: undefined });
    });

    it("says why it can't draw a chart", () => {
        expect(chartFigure(null, null).gap).toBe("missing");
        expect(
            chartFigure({ type: "logit-lens", data: {} }, { type: "logit-lens", data: {} }).gap,
        ).toBe("not-run");
        expect(chartFigure({ type: null, data: null }, null).gap).toBe("not-run");
        expect(chartFigure({ type: "lens", data: LENS_DATA }, { type: "lens" }).gap).toBe(
            "retired",
        );
        expect(
            chartFigure({ type: "patch-lens", data: { runs: 1 } }, { type: "patch-lens" }).gap,
        ).toBe("unsupported");
        expect(chartFigure({ type: "activation-patching", data: { lines: [] } }, null).gap).toBe(
            "not-run",
        );
    });

    it("prefers the config's tool over the chart's stored type", () => {
        expect(
            chartFigure({ type: null, data: AP_DATA }, { type: "activation-patching" }).spec?.kind,
        ).toBe("activation-patching");
    });
});

describe("withoutLinePlot", () => {
    const lens = (uiState: Record<string, unknown> | null) =>
        ({ kind: "logit-lens", data: LENS_DATA, uiState }) as never;

    it("clears the selected and pinned rows that open the line plot", () => {
        const pinnedGroups = [{ tokens: [" Paris"], color: "#f00" }];
        const spec = withoutLinePlot(
            lens({ selectedRow: 3, selectedLayer: 1, pinnedRows: [], pinnedGroups, ramp: "blue" }),
            8,
        );
        expect(spec).toMatchObject({
            uiState: {
                selectedRow: null,
                selectedLayer: null,
                pinnedRows: [],
                pinnedGroups,
                ramp: "blue",
            },
        });
    });

    it("keeps the rows window the selection or first pinned row centered", () => {
        const rowStart = (uiState: Record<string, unknown>) => {
            const spec = withoutLinePlot(lens(uiState), 8) as { uiState: { rowStart: unknown } };
            return spec.uiState.rowStart;
        };
        expect(rowStart({ selectedRow: 20 })).toBe(16);
        expect(rowStart({ pinnedRows: [{ pos: 2, line: "solid" }] })).toBe(0);
        expect(rowStart({ selectedRow: 20, rowStart: 5 })).toBe(5);
        expect(rowStart({ ramp: "teal" })).toBeNull();
    });

    it("leaves other charts and a lens with no saved view as they are", () => {
        const ap = chartFigure({ type: "activation-patching", data: AP_DATA }, null).spec!;
        expect(withoutLinePlot(ap, 8)).toBe(ap);
        const bare = lens(null);
        expect(withoutLinePlot(bare, 8)).toBe(bare);
    });
});

describe("chartFigureGapText", () => {
    it("names the tool a report can't show", () => {
        expect(chartFigureGapText("unsupported", "Patch Lens")).toBe(
            "Patch Lens charts can't be shown in reports yet.",
        );
    });
});

describe("chartPrompt", () => {
    it("reads each tool's prompt from where it keeps it", () => {
        expect(chartPrompt({ data: {} }, { data: { prompt: "The Eiffel Tower is in" } })).toBe(
            "The Eiffel Tower is in",
        );
        expect(chartPrompt({ data: {} }, { data: { srcPrompt: "Paris is in" } })).toBe(
            "Paris is in",
        );
        expect(chartPrompt({ data: { sourcePrompt: "Rome is in" } }, { data: {} })).toBe(
            "Rome is in",
        );
    });

    it("is undefined for a chart with no prompt", () => {
        expect(chartPrompt({ data: {} }, { data: { prompt: "" } })).toBeUndefined();
        expect(chartPrompt(null, null)).toBeUndefined();
    });
});

describe("rowWindowLabel", () => {
    it("counts rows from 1", () => {
        expect(rowWindowLabel({ start: 87, end: 110, total: 111 })).toBe("rows 88–111 of 111");
    });
});
