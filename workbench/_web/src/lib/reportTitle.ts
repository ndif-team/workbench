import type { SerializedEditorState } from "lexical";

/** The parts of a serialized Lexical node the title derivation reads. */
type LexicalNodeLike = {
    type?: string;
    text?: unknown;
    children?: LexicalNodeLike[];
};

/** Plain text of a Lexical SerializedEditorState, one line per block node. */
function extractPlainTextFromLexical(content: SerializedEditorState): string {
    try {
        const visit = (
            node: LexicalNodeLike | undefined,
            lines: string[],
            currentLine: string[],
        ) => {
            if (!node) return;
            const type = node.type;
            if (type === "text" && typeof node.text === "string") {
                currentLine.push(node.text);
            }
            if (Array.isArray(node.children)) {
                for (const child of node.children) {
                    visit(child, lines, currentLine);
                }
            }
            if (type === "linebreak") {
                lines.push(currentLine.join(""));
                currentLine.length = 0;
            }
            // For block-level nodes, terminate the line
            if (
                type &&
                ["paragraph", "heading", "quote", "list", "listitem", "code"].includes(type)
            ) {
                if (currentLine.length > 0) {
                    lines.push(currentLine.join(""));
                    currentLine.length = 0;
                } else {
                    // Ensure empty line for empty blocks
                    lines.push("");
                }
            }
        };
        const lines: string[] = [];
        visit((content as unknown as { root?: LexicalNodeLike }).root, lines, []);
        return lines.join("\n");
    } catch {
        return "";
    }
}

/**
 * A report's display title: its first non-empty line with markdown prefixes
 * stripped, capped at 100 characters. Empty when the report has no text.
 * Plain module (not a server action) so server lists and client UI can share it.
 */
export function deriveReportTitle(content: SerializedEditorState): string {
    const text = extractPlainTextFromLexical(content);
    const lines = text.split(/\r?\n/);
    let first = "";
    for (const raw of lines) {
        const stripped = raw.replace(/^\s+|\s+$/g, "");
        if (stripped.length > 0) {
            first = stripped;
            break;
        }
    }
    if (!first) return "";
    // Strip markdown markers and surrounding whitespace
    first = first.replace(/^\s*(#{1,6}\s+|>\s+|[-*+]\s+|`{3,}.*$|`+)\s*/g, "").trim();
    // Cap length to keep UI tidy
    if (first.length > 100) first = first.slice(0, 100).trimEnd() + "…";
    return first;
}
