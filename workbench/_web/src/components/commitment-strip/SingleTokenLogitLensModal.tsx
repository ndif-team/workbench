"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { TopKLogit, WorkshopToken } from "@/types/workshop";

interface SingleTokenLogitLensModalProps {
    token: WorkshopToken;
    position: number;
    /** [layer][topk_idx] — the per-layer top-K for THIS position. */
    perLayerTopK: TopKLogit[][];
    numLayers: number;
    onClose: () => void;
}

/**
 * Per-layer drill-down for a single completion-token position. Renders the
 * top-K candidates the model considered at each layer, highlighting the row
 * where the chosen token first reached top-1. Modal — closes on ESC or
 * backdrop click.
 *
 * No NDIF call is made: the data is already in the pre-cached fixture.
 */
export function SingleTokenLogitLensModal({
    token,
    position,
    perLayerTopK,
    numLayers,
    onClose,
}: SingleTokenLogitLensModalProps) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div
            data-testid="single-token-logit-lens-modal"
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="bg-background rounded-lg border shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col"
            >
                <header className="flex items-center justify-between border-b p-4">
                    <div>
                        <p className="text-sm text-muted-foreground">
                            Logit lens · position {position}
                        </p>
                        <p className="font-mono text-lg">
                            chosen token:{" "}
                            <span className="font-semibold">{token.text}</span>
                        </p>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        data-testid="single-token-modal-close"
                        onClick={onClose}
                    >
                        ✕
                    </Button>
                </header>

                <div className="flex-1 overflow-y-auto p-4">
                    <table className="w-full text-sm">
                        <thead className="text-xs text-muted-foreground sticky top-0 bg-background">
                            <tr>
                                <th className="text-left pb-2">layer</th>
                                <th className="text-left pb-2">rank-1</th>
                                <th className="text-right pb-2">prob</th>
                                <th className="text-left pb-2 pl-4">chosen-token rank</th>
                            </tr>
                        </thead>
                        <tbody>
                            {perLayerTopK.map((layerTopK, layerIdx) => {
                                const top = layerTopK[0];
                                const chosenRank = layerTopK.findIndex(
                                    (e) => e.token_id === token.id,
                                );
                                const chosenEntry =
                                    chosenRank >= 0 ? layerTopK[chosenRank] : null;
                                const isCommitted =
                                    chosenRank === 0 && top?.token_id === token.id;
                                return (
                                    <tr
                                        key={layerIdx}
                                        data-testid={`logit-lens-layer-${layerIdx}`}
                                        data-committed={isCommitted ? "true" : "false"}
                                        className={
                                            isCommitted
                                                ? "bg-primary/10"
                                                : "border-b border-muted/40"
                                        }
                                    >
                                        <td className="py-1 pr-2 text-muted-foreground">
                                            {layerIdx} / {numLayers - 1}
                                        </td>
                                        <td className="py-1 pr-2 font-mono">
                                            {top?.token_text ?? "—"}
                                        </td>
                                        <td className="py-1 pr-2 text-right">
                                            {top
                                                ? (top.probability * 100).toFixed(1) + "%"
                                                : "—"}
                                        </td>
                                        <td className="py-1 pl-4 text-xs text-muted-foreground">
                                            {chosenEntry
                                                ? `rank ${chosenRank + 1} (${(chosenEntry.probability * 100).toFixed(1)}%)`
                                                : "outside top-K"}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <footer className="border-t p-3 text-xs text-muted-foreground">
                    Each row shows the rank-1 token at that layer. Highlighted row = first
                    layer at which the chosen token reached top-1.
                </footer>
            </div>
        </div>
    );
}
