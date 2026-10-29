import { describe, it, expect } from "bun:test";
import { $createParagraphNode, $getRoot, createEditor, type ElementNode } from "lexical";

import { $createChartEmbedNode, ChartEmbedNode } from "../ChartEmbedNode";

const editor = createEditor({
    nodes: [ChartEmbedNode],
    onError: (error) => {
        throw error;
    },
});

/** A saved document (`editorState.toJSON()`) holding one chart embed of `chartType`. */
function savedDocument(chartType: string | null): string {
    editor.update(
        () => {
            const paragraph = $createParagraphNode();
            paragraph.append($createChartEmbedNode({ chartId: "chart-1", chartType }));
            $getRoot().clear().append(paragraph);
        },
        { discrete: true },
    );
    return JSON.stringify(editor.getEditorState().toJSON());
}

/** The chart embed of a saved document, once loaded into the editor. */
function loadEmbed(saved: string): ChartEmbedNode {
    return editor
        .parseEditorState(saved)
        .read(() =>
            $getRoot().getFirstChildOrThrow<ElementNode>().getFirstChildOrThrow<ChartEmbedNode>(),
        );
}

describe("ChartEmbedNode", () => {
    it("loads a legacy lens2 embed as logit-lens and saves it back that way", () => {
        const embed = loadEmbed(savedDocument("lens2"));

        expect(embed.__chartType).toBe("logit-lens");
        expect(embed.exportJSON().chartType).toBe("logit-lens");
    });

    it("keeps other types, including retired ones and null", () => {
        for (const chartType of ["jlens", "lens", null]) {
            expect(loadEmbed(savedDocument(chartType)).__chartType).toBe(chartType);
        }
    });
});
