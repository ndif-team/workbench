"use client";

import { useEffect, type RefObject } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, type LexicalEditor } from "lexical";
import { $createChartEmbedNode, $hoistChartEmbed, ChartEmbedNode } from "../nodes/ChartEmbedNode";

// MIME type must match what the sidebar's ChartCard sets
const CHART_MIME = "application/x-chart";

type ChartPayload = { chartId: string; chartType: string | null };

function parsePayload(raw: string): ChartPayload | null {
    try {
        const p = JSON.parse(raw) as Partial<ChartPayload>;
        return typeof p.chartId === "string" && p.chartId
            ? { chartId: p.chartId, chartType: p.chartType ?? null }
            : null;
    } catch {
        return null;
    }
}

/** Index of the top-level block a drop at `clientY` goes before (the first
 *  block whose middle is below it), or the block count to append. Read from
 *  the rendered blocks, so it works for drops beside the text column too. */
function dropIndex(editor: LexicalEditor, clientY: number): { index: number; y: number | null } {
    return editor.getEditorState().read(() => {
        const blocks = $getRoot().getChildren();
        let y: number | null = null;
        for (let i = 0; i < blocks.length; i++) {
            const rect = editor.getElementByKey(blocks[i].getKey())?.getBoundingClientRect();
            if (!rect) continue;
            if (clientY < rect.top + rect.height / 2) return { index: i, y: rect.top };
            y = rect.bottom;
        }
        return { index: blocks.length, y };
    });
}

/**
 * Drop a chart from the sidebar anywhere over the editor's scroll area to
 * embed it as a block between the nearest blocks, with an insertion line
 * while dragging. Also keeps embeds top-level (see `$hoistChartEmbed`).
 */
export function DragDropChartPlugin({
    dropZoneRef,
}: {
    dropZoneRef: RefObject<HTMLElement | null>;
}) {
    const [editor] = useLexicalComposerContext();

    useEffect(() => editor.registerNodeTransform(ChartEmbedNode, $hoistChartEmbed), [editor]);

    useEffect(() => {
        const zone = dropZoneRef.current;
        if (!zone) return;
        let detach = () => {};
        const unregister = editor.registerRootListener((rootElem) => {
            detach();
            detach = rootElem ? attach(editor, zone, rootElem) : () => {};
        });
        return () => {
            unregister();
            detach();
        };
    }, [editor, dropZoneRef]);

    return null;
}

/** Wire the drop zone's listeners and insertion line; returns the cleanup. */
function attach(editor: LexicalEditor, zone: HTMLElement, rootElem: HTMLElement): () => void {
    // The line is positioned within the text column's relative wrapper.
    const column = (rootElem.closest(".relative") as HTMLElement | null) ?? rootElem;

    const indicator = document.createElement("div");
    indicator.style.cssText =
        "position:absolute;left:0;right:0;height:2px;border-radius:1px;transform:translateY(-1px);" +
        "background:hsl(var(--primary));opacity:0;pointer-events:none;z-index:50;";
    column.appendChild(indicator);
    const hide = () => {
        indicator.style.opacity = "0";
    };

    const isChartDrag = (e: DragEvent) =>
        !!e.dataTransfer && Array.from(e.dataTransfer.types).includes(CHART_MIME);

    // Capture phase, so Lexical's own drag/drop handling never sees a
    // chart drag (and drops beside the text column still land).
    const onDragOver = (e: DragEvent) => {
        if (!isChartDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer!.dropEffect = "copy";
        const { y } = dropIndex(editor, e.clientY);
        const box = column.getBoundingClientRect();
        const top = Math.max(box.top, Math.min(y ?? box.top, box.bottom)) - box.top;
        indicator.style.top = `${top}px`;
        indicator.style.opacity = "1";
    };
    const onDrop = (e: DragEvent) => {
        if (!isChartDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        hide();
        const payload = parsePayload(e.dataTransfer!.getData(CHART_MIME));
        if (!payload) return;
        const { index } = dropIndex(editor, e.clientY);
        editor.update(() => {
            const embed = $createChartEmbedNode(payload);
            const before = $getRoot().getChildAtIndex(index);
            if (before) before.insertBefore(embed);
            else $getRoot().append(embed);
        });
    };
    const onDragLeave = (e: DragEvent) => {
        if (!zone.contains(e.relatedTarget as Node | null)) hide();
    };

    zone.addEventListener("dragover", onDragOver, true);
    zone.addEventListener("drop", onDrop, true);
    zone.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragend", hide);
    return () => {
        zone.removeEventListener("dragover", onDragOver, true);
        zone.removeEventListener("drop", onDrop, true);
        zone.removeEventListener("dragleave", onDragLeave);
        window.removeEventListener("dragend", hide);
        indicator.remove();
    };
}
