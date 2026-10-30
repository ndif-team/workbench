import { describe, expect, it } from "bun:test";
import { chartFigure, chartFigureGapText } from "../chartFigure";

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

describe("chartFigureGapText", () => {
    it("names the tool a report can't show", () => {
        expect(chartFigureGapText("unsupported", "Patch Lens")).toBe(
            "Patch Lens charts can't be shown in reports yet.",
        );
    });
});
