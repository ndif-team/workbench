"use client";

import {
    $createParagraphNode,
    $isRootOrShadowRoot,
    DecoratorNode,
    type ElementNode,
    type LexicalNode,
    type NodeKey,
    type SerializedLexicalNode,
    type Spread,
} from "lexical";
import * as React from "react";
import { $dfs } from "@lexical/utils";
import { normalizeToolType } from "@/types/charts";
import type { ChartLock } from "@/lib/report/chartLock";
import { ChartEmbed } from "../embed/ChartEmbed";

// Node payload. `chartType` is the chart's stored type when it was embedded;
// documents saved before a tool was retired may still hold its old type.
// `lock`, when set, is the view state the embed is frozen at.
export type ChartEmbedPayload = {
    chartId: string;
    chartType: string | null;
    lock?: ChartLock | null;
};

// Version 2 added the optional `lock`; version 1 documents load unlocked.
export type SerializedChartEmbedNode = Spread<
    {
        type: "chart-embed";
        version: 1 | 2;
        chartId: string;
        chartType: string | null;
        lock?: ChartLock;
    },
    SerializedLexicalNode
>;

/**
 * A chart in a report: a top-level block that draws the chart from its saved
 * state. Documents from before embeds were blocks hold it inside a paragraph;
 * `$hoistChartEmbed` moves it out (the editor runs it as a node transform).
 */
export class ChartEmbedNode extends DecoratorNode<React.JSX.Element> {
    __chartId: string;
    __chartType: string | null;
    __lock: ChartLock | null;

    static getType(): string {
        return "chart-embed";
    }

    static clone(node: ChartEmbedNode): ChartEmbedNode {
        return new ChartEmbedNode(node.__chartId, node.__chartType, node.__lock, node.__key);
    }

    constructor(
        chartId: string,
        chartType: string | null,
        lock: ChartLock | null = null,
        key?: NodeKey,
    ) {
        super(key);
        this.__chartId = chartId;
        this.__chartType = chartType;
        this.__lock = lock;
    }

    static importJSON(serializedNode: SerializedChartEmbedNode): ChartEmbedNode {
        return new ChartEmbedNode(
            serializedNode.chartId,
            normalizeToolType(serializedNode.chartType),
            serializedNode.lock ?? null,
        );
    }

    exportJSON(): SerializedChartEmbedNode {
        return {
            type: "chart-embed",
            version: 2,
            chartId: this.__chartId,
            chartType: this.__chartType,
            ...(this.__lock ? { lock: this.__lock } : {}),
        };
    }

    getChartId(): string {
        return this.getLatest().__chartId;
    }

    getLock(): ChartLock | null {
        return this.getLatest().__lock;
    }

    /** Freeze the embed at `lock`'s view state, or follow the chart (null). */
    setLock(lock: ChartLock | null): void {
        this.getWritable().__lock = lock;
    }

    isInline(): false {
        return false;
    }

    createDOM(): HTMLElement {
        const div = document.createElement("div");
        div.className = "my-3";
        return div;
    }

    updateDOM(): false {
        return false;
    }

    decorate(): React.JSX.Element {
        return (
            <ChartEmbed
                nodeKey={this.getKey()}
                chartId={this.__chartId}
                chartType={this.__chartType}
                lock={this.__lock}
            />
        );
    }
}

export function $createChartEmbedNode(payload: ChartEmbedPayload): ChartEmbedNode {
    return new ChartEmbedNode(payload.chartId, payload.chartType, payload.lock ?? null);
}

export function $isChartEmbedNode(node: LexicalNode | null | undefined): node is ChartEmbedNode {
    return node instanceof ChartEmbedNode;
}

/**
 * Move embeds nested in a block (a paragraph, as older documents saved them)
 * to just after that top-level block: all of the block's embeds at once, in
 * document order, dropping whatever the move left empty (the paragraph, or a
 * list item and its list). An embed left as the document's last block gets an
 * empty paragraph after it, so there is somewhere to keep writing.
 */
export function $hoistChartEmbed(node: ChartEmbedNode): void {
    const parent = node.getParent();
    if (parent === null) return;
    if (!$isRootOrShadowRoot(parent)) {
        const block = node.getTopLevelElementOrThrow() as ElementNode;
        const embeds = $dfs(block)
            .map(({ node: n }) => n)
            .filter($isChartEmbedNode);
        const emptied = embeds.map((embed) => embed.getParentOrThrow());
        let anchor: LexicalNode = block;
        for (const embed of embeds) {
            anchor.insertAfter(embed);
            anchor = embed;
        }
        for (const from of emptied) {
            let el: ElementNode | null = from;
            while (el && !$isRootOrShadowRoot(el) && el.isAttached() && el.isEmpty()) {
                const up: ElementNode | null = el.getParent();
                el.remove();
                el = up;
            }
        }
    }
    if (node.getNextSibling() === null) node.insertAfter($createParagraphNode());
}
