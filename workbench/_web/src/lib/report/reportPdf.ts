/**
 * A report (a saved Lexical document) as a pdfmake document definition:
 * headings, paragraphs with inline formatting and links, lists, quotes and
 * code blocks as text, and each embedded chart as a figure — a snapshot image
 * under its title, or a note saying why it isn't shown. Pure: the caller
 * snapshots the charts first and passes them in.
 */

import type { SerializedEditorState } from "lexical";
import type { Content, ContentText, TDocumentDefinitions } from "pdfmake/interfaces";
import { embedKey, type ChartLock } from "./chartLock";

/** A chart as the PDF shows it, keyed by `embedKey` (chart + lock). */
export type ReportPdfChart = {
    title: string;
    /** Tool and model, shown after the title. */
    subtitle?: string;
} & (
    | { image: { dataUrl: string; width: number; height: number }; note?: never }
    | { image?: never; note: string }
);

/** The loose shape of a serialized Lexical node; only the fields we read. */
type LexNode = {
    type: string;
    children?: LexNode[];
    text?: string;
    format?: number | string;
    tag?: string;
    listType?: string;
    start?: number;
    checked?: boolean;
    url?: string;
    indent?: number;
    chartId?: string;
    lock?: ChartLock;
};

/** An inline text run (pdfmake nests these in a block's `text`). */
type Run = ContentText & { text: string };

// US Letter, with the content box these margins leave.
const PAGE_MARGINS: [number, number, number, number] = [64, 60, 64, 64];
const CONTENT_WIDTH = 612 - PAGE_MARGINS[0] - PAGE_MARGINS[2];
const CONTENT_HEIGHT = 792 - PAGE_MARGINS[1] - PAGE_MARGINS[3];
/** Tallest a figure image may be: a page, less room for its title line. */
const MAX_FIGURE_HEIGHT = CONTENT_HEIGHT - 48;

const TEXT = "#18181b";
const MUTED = "#71717a";
const RULE = "#d4d4d8";
const SURFACE = "#f4f4f5";
const LINK = "#2563eb";

// Arrows the PDF's fonts lack (pdfmake's Roboto, and Courier for code), in
// characters they have; anything else they lack shows as a missing glyph.
const GLYPH_FALLBACKS: Record<string, string> = {
    "→": "->",
    "←": "<-",
    "↔": "<->",
    "⇒": "=>",
    "⇐": "<=",
    "⇔": "<=>",
};
const MISSING_GLYPHS = new RegExp(`[${Object.keys(GLYPH_FALLBACKS).join("")}]`, "g");

/** Text as the PDF can draw it. */
export function pdfText(text: string): string {
    return text.replace(MISSING_GLYPHS, (ch) => GLYPH_FALLBACKS[ch]);
}

// Lexical's TextNode format bits.
const BOLD = 1;
const ITALIC = 2;
const STRIKETHROUGH = 4;
const UNDERLINE = 8;
const CODE = 16;
const SUBSCRIPT = 32;
const SUPERSCRIPT = 64;
const HIGHLIGHT = 128;

function rootChildren(state: SerializedEditorState): LexNode[] {
    return ((state?.root as unknown as LexNode | undefined)?.children ?? []) as LexNode[];
}

function plainText(node: LexNode): string {
    if (node.type === "linebreak") return "\n";
    if (node.type === "tab") return "\t";
    if (typeof node.text === "string") return node.text;
    return (node.children ?? []).map(plainText).join("");
}

/** A chart embedded in a report: its chart, its lock if any, and the key
 *  its figure goes by. */
export type ReportEmbed = { key: string; chartId: string; lock: ChartLock | null };

/** The report's embeds, once per key (chart + lock), in document order. */
export function reportEmbeds(state: SerializedEditorState): ReportEmbed[] {
    const embeds: ReportEmbed[] = [];
    const visit = (node: LexNode) => {
        if (node.type === "chart-embed" && node.chartId) {
            const key = embedKey(node.chartId, node.lock);
            if (!embeds.some((e) => e.key === key))
                embeds.push({ key, chartId: node.chartId, lock: node.lock ?? null });
        }
        node.children?.forEach(visit);
    };
    rootChildren(state).forEach(visit);
    return embeds;
}

/** The report's title: the text of its first non-empty block, else "Report". */
export function reportTitle(state: SerializedEditorState): string {
    for (const block of rootChildren(state)) {
        const text = plainText(block).replace(/\s+/g, " ").trim();
        if (text) return text.length > 100 ? text.slice(0, 100).trimEnd() + "…" : text;
    }
    return "Report";
}

function textRun(node: LexNode, extra: Partial<Run>): Run {
    const f = typeof node.format === "number" ? node.format : 0;
    const run: Run = { text: pdfText(node.text ?? "").replace(/\t/g, "    ") };
    if (f & BOLD) run.bold = true;
    if (f & ITALIC) run.italics = true;
    // A link is underlined on top of the text's own decoration.
    const decoration = [
        (f & UNDERLINE || extra.link) && "underline",
        f & STRIKETHROUGH && "lineThrough",
    ].filter(Boolean) as ("underline" | "lineThrough")[];
    if (decoration.length) run.decoration = decoration.length === 1 ? decoration[0] : decoration;
    if (f & CODE) Object.assign(run, { font: "Courier", fontSize: 9.5, background: SURFACE });
    if (f & SUBSCRIPT) run.sub = true;
    if (f & SUPERSCRIPT) run.sup = true;
    if (f & HIGHLIGHT) run.background = "#fef08a";
    return { ...run, ...extra };
}

/** Link a run only to web and mail addresses, not e.g. `javascript:`. */
function linkTarget(url: string | undefined): { link?: string } {
    return url && /^(https?:|mailto:)/i.test(url.trim()) ? { link: url.trim() } : {};
}

const INLINE_TYPES = new Set(["text", "code-highlight", "linebreak", "tab", "link", "autolink"]);

/** Inline content of a block as text runs. Chart embeds are left to the
 *  block level. */
function inlines(nodes: LexNode[] | undefined, extra: Partial<Run> = {}): Run[] {
    const runs: Run[] = [];
    for (const node of nodes ?? []) {
        switch (node.type) {
            case "text":
            case "code-highlight":
                runs.push(textRun(node, extra));
                break;
            case "linebreak":
                runs.push({ text: "\n", ...extra });
                break;
            case "tab":
                runs.push({ text: "    ", ...extra });
                break;
            case "link":
            case "autolink":
                runs.push(
                    ...inlines(node.children, { ...extra, ...linkTarget(node.url), color: LINK }),
                );
                break;
            case "chart-embed":
                break;
            default:
                runs.push(...inlines(node.children, extra));
        }
    }
    return runs;
}

/** pdfmake drops a block with no text; a lone space keeps an empty line. */
function textOrSpace(runs: Run[]): Run[] | string {
    return runs.some((r) => r.text !== "") ? runs : " ";
}

function alignment(node: LexNode): "center" | "right" | "justify" | undefined {
    return node.format === "center" || node.format === "right" || node.format === "justify"
        ? node.format
        : node.format === "end"
          ? "right"
          : undefined;
}

function indentMargin(node: LexNode, bottom: number): [number, number, number, number] {
    return [Math.max(0, node.indent ?? 0) * 18, 0, 0, bottom];
}

function figure(embed: LexNode, charts: Map<string, ReportPdfChart>): Content {
    const chart = charts.get(embedKey(embed.chartId!, embed.lock)) ?? {
        title: "Chart",
        note: "This chart couldn't be loaded.",
    };
    const caption: Content = {
        text: [
            { text: pdfText(chart.title), bold: true },
            ...(chart.subtitle
                ? [{ text: `  ${pdfText(chart.subtitle)}`, color: MUTED, fontSize: 9 }]
                : []),
        ],
        fontSize: 10,
        margin: [0, 0, 0, 4],
    };
    if (chart.image) {
        // Full content width, unless that makes it taller than a page.
        const aspect = chart.image.height / Math.max(1, chart.image.width);
        let width = CONTENT_WIDTH;
        let height = width * aspect;
        if (height > MAX_FIGURE_HEIGHT) {
            height = MAX_FIGURE_HEIGHT;
            width = height / aspect;
        }
        return {
            stack: [caption, { image: chart.image.dataUrl, width, height, alignment: "center" }],
            unbreakable: true,
            margin: [0, 6, 0, 14],
        };
    }
    return {
        stack: [
            caption,
            {
                table: {
                    widths: ["*"],
                    body: [
                        [
                            {
                                text: pdfText(chart.note),
                                color: MUTED,
                                alignment: "center",
                                margin: [0, 12, 0, 12],
                            },
                        ],
                    ],
                },
                layout: { hLineColor: () => RULE, vLineColor: () => RULE },
            },
        ],
        unbreakable: true,
        margin: [0, 6, 0, 14],
    };
}

function list(node: LexNode): Content {
    const check = node.listType === "check";
    const items: Content[] = [];
    for (const item of node.children ?? []) {
        if (item.type !== "listitem") continue;
        const nested = (item.children ?? []).filter((c) => c.type === "list");
        const runs = inlines((item.children ?? []).filter((c) => c.type !== "list"));
        const label = check ? [{ text: item.checked ? "[x] " : "[ ] " }, ...runs] : runs;
        // A Lexical sub-list is an item holding only the list; pdfmake draws
        // a list item that is itself a list with no marker of its own.
        if (!runs.some((r) => r.text !== "") && nested.length) {
            items.push(...nested.map(list));
        } else if (nested.length) {
            items.push({ stack: [{ text: textOrSpace(label) }, ...nested.map(list)] });
        } else {
            items.push({ text: textOrSpace(label) });
        }
    }
    const margin = indentMargin(node, 8);
    if (node.listType === "number") return { ol: items, start: node.start ?? 1, margin };
    return { ul: items, margin, ...(check ? { type: "none" as const } : {}) };
}

function blocks(nodes: LexNode[], charts: Map<string, ReportPdfChart>): Content[] {
    const out: Content[] = [];
    for (const node of nodes) {
        switch (node.type) {
            case "heading": {
                const level = /^h[1-6]$/.test(node.tag ?? "") ? Number(node.tag!.slice(1)) : 1;
                out.push({
                    text: textOrSpace(inlines(node.children)),
                    style: `h${level}`,
                    alignment: alignment(node),
                    headlineLevel: level,
                });
                break;
            }
            case "paragraph": {
                // Documents from before embeds were blocks hold them in a
                // paragraph: the paragraph's text, then the figures.
                const embeds = (node.children ?? []).filter((c) => c.type === "chart-embed");
                const runs = inlines(node.children);
                if (!embeds.length || runs.some((r) => r.text.trim() !== "")) {
                    out.push({
                        text: textOrSpace(runs),
                        alignment: alignment(node),
                        margin: indentMargin(node, 8),
                    });
                }
                for (const embed of embeds) if (embed.chartId) out.push(figure(embed, charts));
                break;
            }
            case "quote":
                out.push({
                    table: {
                        widths: ["*"],
                        body: [
                            [
                                {
                                    text: textOrSpace(inlines(node.children)),
                                    italics: true,
                                    color: "#52525b",
                                },
                            ],
                        ],
                    },
                    layout: {
                        hLineWidth: () => 0,
                        vLineWidth: (i: number) => (i === 0 ? 2.5 : 0),
                        vLineColor: () => RULE,
                        paddingLeft: () => 12,
                        paddingTop: () => 2,
                        paddingBottom: () => 2,
                    },
                    margin: [0, 2, 0, 10],
                });
                break;
            case "list":
                out.push(list(node));
                break;
            case "code":
                out.push({
                    table: {
                        widths: ["*"],
                        body: [
                            [
                                {
                                    text: textOrSpace(
                                        inlines(node.children).map((r) => ({ text: r.text })),
                                    ),
                                    font: "Courier",
                                    fontSize: 9,
                                    lineHeight: 1.2,
                                    preserveLeadingSpaces: true,
                                },
                            ],
                        ],
                    },
                    layout: {
                        fillColor: () => SURFACE,
                        hLineWidth: () => 0,
                        vLineWidth: () => 0,
                        paddingLeft: () => 10,
                        paddingRight: () => 10,
                        paddingTop: () => 8,
                        paddingBottom: () => 8,
                    },
                    margin: [0, 2, 0, 10],
                });
                break;
            case "chart-embed":
                if (node.chartId) out.push(figure(node, charts));
                break;
            case "horizontalrule":
                out.push({
                    canvas: [
                        {
                            type: "line",
                            x1: 0,
                            y1: 0,
                            x2: CONTENT_WIDTH,
                            y2: 0,
                            lineWidth: 0.5,
                            lineColor: RULE,
                        },
                    ],
                    margin: [0, 6, 0, 12],
                });
                break;
            default: {
                // A block type this mapping doesn't know: its text as a
                // paragraph, or its child blocks.
                const kids = node.children ?? [];
                if (kids.some((c) => INLINE_TYPES.has(c.type))) {
                    out.push({ text: textOrSpace(inlines(kids)), margin: indentMargin(node, 8) });
                } else {
                    out.push(...blocks(kids, charts));
                }
            }
        }
    }
    return out;
}

/** The pdfmake definition of a report; `charts` holds its embedded charts. */
export function reportPdfDefinition(
    state: SerializedEditorState,
    { title, charts }: { title: string; charts: Map<string, ReportPdfChart> },
): TDocumentDefinitions {
    return {
        pageSize: "LETTER",
        pageMargins: PAGE_MARGINS,
        info: { title, creator: "Workbench" },
        content: blocks(rootChildren(state), charts),
        // Don't leave a heading alone at the bottom of a page.
        pageBreakBefore: (node, queries) =>
            !!node.headlineLevel && queries.getFollowingNodesOnPage().length === 0,
        footer: (page, pages) => ({
            columns: [
                { text: pdfText(title), color: MUTED },
                { text: `${page} / ${pages}`, alignment: "right", color: MUTED },
            ],
            fontSize: 8,
            margin: [PAGE_MARGINS[0], 24, PAGE_MARGINS[2], 0],
        }),
        defaultStyle: { font: "Roboto", fontSize: 10.5, lineHeight: 1.3, color: TEXT },
        styles: {
            h1: { fontSize: 20, bold: true, margin: [0, 12, 0, 8] },
            h2: { fontSize: 16, bold: true, margin: [0, 12, 0, 6] },
            h3: { fontSize: 13.5, bold: true, margin: [0, 10, 0, 5] },
            h4: { fontSize: 12, bold: true, margin: [0, 8, 0, 4] },
            h5: { fontSize: 11, bold: true, margin: [0, 8, 0, 4] },
            h6: { fontSize: 10.5, bold: true, margin: [0, 8, 0, 4] },
        },
    };
}

/** A file name for the report's PDF. */
export function reportPdfFileName(title: string): string {
    const base = title
        .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80)
        .trim();
    return `${base || "Report"}.pdf`;
}
