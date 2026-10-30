import { describe, expect, it } from "bun:test";
import type { SerializedEditorState } from "lexical";
import {
    pdfText,
    reportChartIds,
    reportPdfDefinition,
    reportPdfFileName,
    reportTitle,
    type ReportPdfChart,
} from "../reportPdf";

type N = Record<string, unknown>;

const text = (t: string, format = 0): N => ({ type: "text", text: t, format });
const block = (type: string, children: N[], extra: N = {}): N => ({ type, children, ...extra });
const doc = (...children: N[]) =>
    ({ root: { type: "root", children } }) as unknown as SerializedEditorState;
const embed = (chartId: string): N => ({ type: "chart-embed", chartId, chartType: "logit-lens" });

function content(state: SerializedEditorState, charts = new Map<string, ReportPdfChart>()) {
    return reportPdfDefinition(state, { title: "T", charts }).content as N[];
}

describe("reportChartIds", () => {
    it("lists each embedded chart once, in document order, nested embeds included", () => {
        const state = doc(
            embed("b"),
            block("paragraph", [text("x"), embed("a")]),
            embed("b"),
            embed("c"),
        );
        expect(reportChartIds(state)).toEqual(["b", "a", "c"]);
    });
});

describe("reportTitle", () => {
    it("is the first non-empty block's text", () => {
        const state = doc(
            block("paragraph", []),
            block("heading", [text("Paris "), text("emerges", 1)], { tag: "h1" }),
        );
        expect(reportTitle(state)).toBe("Paris emerges");
    });

    it("falls back to Report", () => {
        expect(reportTitle(doc(embed("a")))).toBe("Report");
    });
});

describe("reportPdfDefinition", () => {
    it("maps headings to their level's style", () => {
        const [h] = content(doc(block("heading", [text("Results")], { tag: "h2" })));
        expect(h).toMatchObject({ text: [{ text: "Results" }], style: "h2", headlineLevel: 2 });
    });

    it("carries inline formatting and links", () => {
        const [p] = content(
            doc(
                block("paragraph", [
                    text("b", 1),
                    text("i", 2),
                    text("us", 8 | 4),
                    text("c", 16),
                    { type: "linebreak" },
                    block("link", [text("site")], { url: "https://ndif.us" }),
                ]),
            ),
        );
        const runs = p.text as N[];
        expect(runs[0]).toMatchObject({ text: "b", bold: true });
        expect(runs[1]).toMatchObject({ text: "i", italics: true });
        expect(runs[2].decoration).toEqual(["underline", "lineThrough"]);
        expect(runs[3]).toMatchObject({ text: "c", font: "Courier" });
        expect(runs[4]).toMatchObject({ text: "\n" });
        expect(runs[5]).toMatchObject({
            text: "site",
            link: "https://ndif.us",
            decoration: "underline",
        });
    });

    it("keeps an empty paragraph as a blank line", () => {
        const [p] = content(doc(block("paragraph", [])));
        expect(p.text).toBe(" ");
    });

    it("nests sub-lists without a marker of their own and numbers from start", () => {
        const sub = block("list", [block("listitem", [text("inner")])], { listType: "bullet" });
        const [ol] = content(
            doc(
                block("list", [block("listitem", [text("outer")]), block("listitem", [sub])], {
                    listType: "number",
                    start: 3,
                }),
            ),
        );
        expect(ol.start).toBe(3);
        const items = ol.ol as N[];
        expect(items[0]).toMatchObject({ text: [{ text: "outer" }] });
        expect(items[1]).toMatchObject({ ul: [{ text: [{ text: "inner" }] }] });
    });

    it("marks checklist items", () => {
        const [ul] = content(
            doc(
                block(
                    "list",
                    [
                        block("listitem", [text("done")], { checked: true }),
                        block("listitem", [text("todo")], { checked: false }),
                    ],
                    { listType: "check" },
                ),
            ),
        );
        const items = ul.ul as { text: N[] }[];
        expect(items.map((i) => i.text[0].text)).toEqual(["[x] ", "[ ] "]);
    });

    it("sets code blocks in Courier, keeping indentation", () => {
        const [code] = content(
            doc(
                block("code", [
                    { type: "code-highlight", text: "def f():" },
                    { type: "linebreak" },
                    { type: "tab" },
                    { type: "code-highlight", text: "return 1" },
                ]),
            ),
        );
        const cell = (code.table as { body: N[][] }).body[0][0];
        expect(cell).toMatchObject({ font: "Courier", preserveLeadingSpaces: true });
        expect((cell.text as N[]).map((r) => r.text).join("")).toBe("def f():\n    return 1");
    });

    it("draws a chart as a captioned figure at the content width", () => {
        const charts = new Map<string, ReportPdfChart>([
            [
                "a",
                {
                    title: "Lens",
                    subtitle: "Logit Lens · gpt2",
                    image: { dataUrl: "data:image/png;base64,x", width: 720, height: 360 },
                },
            ],
        ]);
        const [fig] = content(doc(embed("a")), charts);
        expect(fig.unbreakable).toBe(true);
        const [caption, image] = fig.stack as N[];
        expect((caption.text as N[]).map((r) => r.text)).toEqual(["Lens", "  Logit Lens · gpt2"]);
        expect(image).toMatchObject({ image: "data:image/png;base64,x", width: 484, height: 242 });
    });

    it("shrinks a figure taller than a page to fit it", () => {
        const charts = new Map<string, ReportPdfChart>([
            ["a", { title: "Tall", image: { dataUrl: "d", width: 720, height: 7200 } }],
        ]);
        const image = (content(doc(embed("a")), charts)[0].stack as N[])[1];
        expect(image.height as number).toBeLessThan(668);
        expect((image.width as number) / (image.height as number)).toBeCloseTo(0.1);
    });

    it("notes a chart it can't draw, and one it wasn't given", () => {
        const charts = new Map<string, ReportPdfChart>([
            ["a", { title: "Patch", note: "Patch Lens charts can't be shown in reports yet." }],
        ]);
        const [a, b] = content(doc(embed("a"), embed("gone")), charts);
        const note = (f: N) => ((f.stack as N[])[1].table as { body: N[][] }).body[0][0].text;
        expect(note(a)).toBe("Patch Lens charts can't be shown in reports yet.");
        expect(note(b)).toBe("This chart couldn't be loaded.");
    });

    it("draws an embed saved inside a paragraph as a figure, without an empty paragraph", () => {
        const charts = new Map<string, ReportPdfChart>([
            ["a", { title: "Lens", image: { dataUrl: "d", width: 10, height: 10 } }],
        ]);
        const out = content(doc(block("paragraph", [embed("a")])), charts);
        expect(out).toHaveLength(1);
        expect(out[0].stack).toBeDefined();
    });
});

describe("pdfText", () => {
    it("spells arrows the fonts lack with ones they have", () => {
        expect(pdfText("Colosseum → Eiffel ⇒ done")).toBe("Colosseum -> Eiffel => done");
        expect(pdfText("α ≈ β")).toBe("α ≈ β");
    });
});

describe("reportPdfFileName", () => {
    it("drops characters file systems reject", () => {
        expect(reportPdfFileName('Paris: a/b "lens"?')).toBe("Paris a b lens.pdf");
        expect(reportPdfFileName("   ")).toBe("Report.pdf");
    });
});
