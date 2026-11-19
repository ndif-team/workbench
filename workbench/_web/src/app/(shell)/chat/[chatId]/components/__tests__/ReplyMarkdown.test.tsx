import { describe, it, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ReplyMarkdown } from "../ReplyMarkdown";

const html = (text: string) => renderToStaticMarkup(<ReplyMarkdown text={text} />);

describe("ReplyMarkdown", () => {
    it("renders a reply's markdown: emphasis, lists, code and headings", () => {
        const out = html(
            "## Cities\n\nThe capital is **Paris**.\n\n- Lyon\n- Marseille\n\n1. one\n\nUse `ls`:\n\n```sh\nls -la\n```",
        );
        expect(out).toContain("<h3");
        expect(out).toContain("<strong");
        expect(out).toContain(">Paris</strong>");
        expect(out).toMatch(/<ul[^>]*>\s*<li[^>]*>Lyon<\/li>/);
        expect(out).toMatch(/<ol[^>]*>/);
        expect(out).toMatch(/<code[^>]*>ls<\/code>/);
        expect(out).toMatch(/<pre[^>]*><code[^>]*>ls -la\n<\/code><\/pre>/);
    });

    it("renders GitHub's tables and strikethrough", () => {
        const out = html("| City | Country |\n|---|---|\n| Paris | France |\n\n~~Rome~~");
        expect(out).toContain("<table");
        expect(out).toMatch(/<th[^>]*>City<\/th>/);
        expect(out).toMatch(/<td[^>]*>Paris<\/td>/);
        expect(out).toContain("<del>Rome</del>");
    });

    it("shows raw HTML as the text it is", () => {
        const out = html("<think>\nPondering.\n</think>\n\nAnswer <b>bold</b>");
        expect(out).toContain("&lt;think&gt;");
        expect(out).toContain("Pondering.");
        expect(out).toContain("&lt;b&gt;bold&lt;/b&gt;");
        expect(out).not.toContain("<b>");
        expect(out).not.toContain("<think>");
    });

    it("links an image instead of loading it, and drops unsafe link targets", () => {
        const out = html("![a chart](https://example.com/chart.png) [click](javascript:alert(1))");
        expect(out).not.toContain("<img");
        expect(out).toContain('href="https://example.com/chart.png"');
        expect(out).toContain(">a chart</a>");
        expect(out).not.toContain("javascript:");
        expect(out).toMatch(
            /<a[^>]*rel="noreferrer noopener nofollow"[^>]*target="_blank"|target="_blank"[^>]*rel="noreferrer noopener nofollow"/,
        );
    });
});
