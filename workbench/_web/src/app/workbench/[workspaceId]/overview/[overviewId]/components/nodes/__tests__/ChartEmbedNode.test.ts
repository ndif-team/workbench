import { describe, it, expect } from "bun:test";
import {
    $createParagraphNode,
    $createTextNode,
    $getRoot,
    createEditor,
    type ElementNode,
    type LexicalNode,
} from "lexical";

import { $createChartEmbedNode, $hoistChartEmbed, ChartEmbedNode } from "../ChartEmbedNode";

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

describe("$hoistChartEmbed", () => {
    /** The top-level blocks after building a document with the transform on,
     *  as "type" or "type:text". */
    function blocksAfter(build: () => void): string[] {
        const hoisting = createEditor({
            nodes: [ChartEmbedNode],
            onError: (error) => {
                throw error;
            },
        });
        hoisting.registerNodeTransform(ChartEmbedNode, $hoistChartEmbed);
        hoisting.update(build, { discrete: true });
        return hoisting.getEditorState().read(() =>
            $getRoot()
                .getChildren()
                .map(
                    (n: LexicalNode) =>
                        n.getType() + (n.getTextContent() ? `:${n.getTextContent()}` : ""),
                ),
        );
    }
    const embed = () => $createChartEmbedNode({ chartId: "chart-1", chartType: "logit-lens" });
    const paragraph = (text?: string) => {
        const p = $createParagraphNode();
        if (text) p.append($createTextNode(text));
        return p;
    };

    it("lifts an embed out of the paragraph older documents saved it in", () => {
        expect(
            blocksAfter(() => {
                const p = paragraph();
                p.append(embed());
                $getRoot().clear().append(p);
            }),
        ).toEqual(["chart-embed", "paragraph"]);
    });

    it("keeps the paragraph's text, with the embed after it", () => {
        expect(
            blocksAfter(() => {
                const p = paragraph("before");
                p.append(embed());
                $getRoot().clear().append(p, paragraph("next"));
            }),
        ).toEqual(["paragraph:before", "chart-embed", "paragraph:next"]);
    });

    it("leaves a top-level embed where it is", () => {
        expect(
            blocksAfter(() => {
                $getRoot().clear().append(paragraph("a"), embed(), paragraph("b"));
            }),
        ).toEqual(["paragraph:a", "chart-embed", "paragraph:b"]);
    });
});
