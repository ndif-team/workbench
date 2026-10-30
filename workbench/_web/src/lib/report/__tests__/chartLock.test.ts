import { describe, expect, it } from "bun:test";
import {
    chartView,
    dataFingerprint,
    embedKey,
    lockChart,
    rerunSinceLock,
    withView,
} from "../chartLock";

type Config = { type?: string | null; data?: Record<string, unknown> };

const uiState = { pinnedRows: [{ pos: 3, line: "solid" }] };
const lensConfig: Config = { type: "logit-lens", data: { model: "gpt2", prompt: "Hi", uiState } };
const apConfig: Config = {
    type: "activation-patching",
    data: { model: "gpt2", selectedMode: "rank", selectedLineIndices: [0, 2] },
};
const chart = { type: "logit-lens", data: { meta: { version: 2 }, input: ["Hi"] } };

describe("chartView / withView", () => {
    it("keeps only the view fields a config has", () => {
        expect(chartView(lensConfig)).toEqual({ uiState });
        expect(chartView(apConfig)).toEqual({ selectedMode: "rank", selectedLineIndices: [0, 2] });
        expect(chartView(null)).toEqual({});
    });

    it("puts a locked view over the live config and keeps its other settings", () => {
        const live: Config = {
            ...lensConfig,
            data: { ...lensConfig.data, uiState: { pinnedRows: [] } },
        };
        const viewed = withView(live, { uiState });
        expect(viewed.data).toEqual({ model: "gpt2", prompt: "Hi", uiState });
        expect(viewed.data?.uiState).toBe(uiState); // same object: the widget sees no change
    });

    it("clears a view field the chart didn't have when locked", () => {
        expect(withView(lensConfig, {}).data).toEqual({ model: "gpt2", prompt: "Hi" });
    });
});

describe("lockChart / rerunSinceLock", () => {
    it("records the view, the time and a fingerprint of the results", () => {
        const lock = lockChart(chart, lensConfig, 42);
        expect(lock).toEqual({ view: { uiState }, at: 42, data: dataFingerprint(chart.data) });
    });

    it("tells a re-run chart from an unchanged one", () => {
        const lock = lockChart(chart, lensConfig);
        expect(rerunSinceLock(lock, { ...chart, data: { ...chart.data } })).toBe(false);
        expect(rerunSinceLock(lock, { ...chart, data: { ...chart.data, input: ["Bye"] } })).toBe(
            true,
        );
        expect(rerunSinceLock(lock, null)).toBe(false);
    });
});

describe("embedKey", () => {
    it("is the chart id, plus the lock time when locked", () => {
        expect(embedKey("c1", null)).toBe("c1");
        expect(embedKey("c1", { view: {}, at: 7, data: "x" })).toBe("c1@7");
    });
});
