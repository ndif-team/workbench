"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { Token } from "@/types/models";
import type { LensConfigData } from "@/types/lens";
import { useLensWorkspace } from "@/stores/useLensWorkspace";

interface TokenAreaProps {
    config: LensConfigData;
    handleTokenClick: (event: React.MouseEvent<HTMLDivElement>, idx: number) => void;
    tokenData: Token[];
    loading: boolean;
    showFill: boolean;
}

// Token styling constants
const TOKEN_STYLES = {
    base: "!text-sm !leading-5 whitespace-pre-wrap break-words select-none !box-border relative",
    highlight: "bg-primary/30 ring-1 ring-primary/30 ring-inset",
    filled: "bg-primary/70 ring-1 ring-primary/30 ring-inset",
    hover: "hover:bg-primary/20 hover:ring-1 hover:ring-primary/30 hover:ring-inset",
    pinned: "bg-amber-300/50 ring-1 ring-amber-400/50 ring-inset dark:bg-amber-600/30 dark:ring-amber-500/30",
    externalHover: "bg-blue-200/60 ring-1 ring-blue-400/50 ring-inset dark:bg-blue-600/30 dark:ring-blue-500/30",
} as const;

const fix = (text: string) => {
    const numNewlines = (text.match(/\n/g) || []).length;

    const result = text
        .replace(/\r\n/g, "\\r\\n") // Windows line endings
        .replace(/\n/g, "\\n") // Newlines
        .replace(/\r/g, "\\r") // Carriage returns
        .replace(/\t/g, "\\t"); // Tabs

    return {
        result: result,
        numNewlines: numNewlines,
    };
};

export function TokenArea({
    config,
    handleTokenClick,
    tokenData,
    loading,
    showFill,
}: TokenAreaProps) {
    const { pinnedRows, hoveredRow, hoverRow, clearHover } = useLensWorkspace();

    // Create a set of pinned positions for fast lookup
    const pinnedPositions = new Set(pinnedRows.map((row) => row.pos));

    const getTokenStyle = (token: Token, idx: number) => {
        const isFilled = config.token.targetIds.length > 0;
        const isPinned = pinnedPositions.has(idx);
        const isExternalHovered = hoveredRow === idx;

        let backgroundStyle = "";
        if (isExternalHovered) {
            // Token is being hovered from the widget - show external hover style
            backgroundStyle = TOKEN_STYLES.externalHover;
        } else if (isPinned) {
            // Token is pinned in widget - show pinned style
            backgroundStyle = TOKEN_STYLES.pinned;
        } else if (config.token.idx === idx && showFill) {
            backgroundStyle = isFilled ? TOKEN_STYLES.filled : TOKEN_STYLES.highlight;
        } else {
            backgroundStyle = "bg-transparent";
        }

        return cn(
            TOKEN_STYLES.base,
            backgroundStyle,
            !loading && TOKEN_STYLES.hover,
            token.text === "\\n" ? "w-full" : "w-fit",
            loading ? "cursor-progress" : "cursor-pointer",
        );
    };

    return (
        <div className="w-full custom-scrollbar select-none whitespace-pre-wrap break-words">
            {tokenData.map((token, idx) => {
                const styles = getTokenStyle(token, idx);

                const { result, numNewlines } = fix(token.text);

                return (
                    <span key={`token-${idx}`}>
                        <span
                            data-token-id={idx}
                            className={styles}
                            onClick={(event: React.MouseEvent<HTMLDivElement>) => {
                                handleTokenClick(event, idx);
                            }}
                            onMouseEnter={() => {
                                if (!loading) {
                                    hoverRow(idx);
                                }
                            }}
                            onMouseLeave={() => {
                                if (!loading) {
                                    clearHover();
                                }
                            }}
                        >
                            {result}
                        </span>
                        {numNewlines > 0 && "\n".repeat(numNewlines)}
                    </span>
                );
            })}
        </div>
    );
}
