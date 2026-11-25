import { describe, expect, it } from "bun:test";

import { generateNotebook } from "../notebook";

const CONFIG = {
    model: "org/model",
    srcPrompt: "The capital of France is",
    tgtPrompt: "The capital of Japan is",
    srcPos: [3],
    tgtPos: [3],
    tgtFreeze: [],
};
const CHART = { lines: [[0.1, 0.9]], ranks: [[1, 0]], prob_diffs: [[0, 0.8]], tokenLabels: [" Paris"] };

/** The code cells of a generated notebook, by what each one does. */
async function cells(input: Partial<Parameters<typeof generateNotebook>[0]>) {
    const notebook = JSON.parse(
        await generateNotebook({ configType: "activation-patching", configData: CONFIG, ...input }),
    );
    const code = notebook.cells.filter((cell: { cell_type: string }) => cell.cell_type === "code");
    const find = (text: string) =>
        code.find((cell: { source: string }) => cell.source.includes(text)) as {
            source: string;
            outputs: { data: Record<string, string> }[];
        };
    return {
        setup: find("%pip install"),
        model: find("model = "),
        parameters: find("src_prompt = "),
        run: find("activation_patching("),
        sources: code.map((cell: { source: string }) => cell.source).join("\n"),
    };
}

describe("generateNotebook", () => {
    it("a standard model keeps the template's setup and loader", async () => {
        const nb = await cells({ model: {} });
        expect(nb.model.source).toContain("StandardizedTransformer(");
        expect(nb.setup.source.match(/%pip install/g)).toHaveLength(1);
        expect(nb.parameters.source).toContain("tool_options = {}");
        expect(nb.run.source).toContain("**tool_options");
    });

    it("no marker is left in a generated cell", async () => {
        const nb = await cells({ model: { looped: true } });
        expect(nb.sources).not.toMatch(/# (SETUP|MODEL|CONFIG|PARAMETERS)\b/);
    });

    it("a looped model gets its own wrapper, packages and options", async () => {
        const nb = await cells({
            model: { looped: true },
            configData: { ...CONFIG, patch: "output" },
        });
        expect(nb.model.source).toContain("LoopedTransformer(MODEL_NAME");
        expect(nb.model.source).not.toContain("StandardizedTransformer");
        expect(nb.setup.source).toContain('%pip install "transformers>=5.24.0" "torchvision"');
        expect(nb.setup.source.indexOf("nnsightful.git")).toBeLessThan(
            nb.setup.source.indexOf("transformers>="),
        );
        expect(nb.parameters.source).toContain('tool_options = {"patch": "output"}');
    });

    it("a model the catalog no longer lists is loaded as a standard one", async () => {
        const nb = await cells({});
        expect(nb.model.source).toContain("StandardizedTransformer(");
    });

    it("the embedded chart keeps the data's sections", async () => {
        const sections = [{ start: 0, end: 1, label: "prelude", dividers: [] }];
        const withSections = await cells({ chartData: { ...CHART, sections } });
        const without = await cells({ chartData: CHART });
        expect(withSections.run.outputs[0].data["text/html"]).toContain('"sections":[{"start":0');
        expect(without.run.outputs[0].data["text/html"]).not.toContain('"sections"');
    });
});
