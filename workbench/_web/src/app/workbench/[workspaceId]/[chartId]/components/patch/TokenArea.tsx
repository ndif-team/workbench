"use client";

import { cn } from "@/lib/utils";
import type { Token } from "@/types/models";
import { usePatch } from "./PatchProvider";
import { useTokenHighlight } from "./useTokenHighlight";
import { useConnections } from "./ConnectionsProvider";

interface TokenAreaProps {
  side: "source" | "destination";
}

// Token styling constants
const tokenStyles = {
  base: "text-sm whitespace-pre-wrap select-none !box-border relative",
  highlight: "bg-primary/30 after:absolute after:inset-0 after:border after:border-primary/30",
  filled: "!bg-primary/70 after:absolute after:inset-0 after:border after:border-primary/30",
  hover:
    "hover:bg-primary/20 hover:after:absolute hover:after:inset-0 hover:after:border hover:after:border-primary/30",
  ablate: "!bg-red-400/70 after:absolute after:inset-0 after:border after:border-red-400/70",
  loop: "!bg-yellow-300/70 after:absolute after:inset-0 after:border after:border-yellow-300/70",
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

export function TokenArea({ side }: TokenAreaProps) {
  const { sourceTokenData, destTokenData, mainMode, subMode } = usePatch();
  const {
    isSelecting,
    isInLiveSelection,
    isIdxInAnyGroup,
    setIsSelecting,
    setSelectionStartIdx,
    setSelectionHoverIdx,
    onSelectionEnd,
    isAblated,
    isLooped,
    toggleAblate,
    toggleLoop,
  } = useTokenHighlight(side);
  const { connections, startConnection, enterToken, endConnection, drag, clearHover } =
    useConnections();

  const onMouseLeave = () => {
    if (mainMode === "connect" && side === "destination") {
      clearHover();
    }
  };

  const getTokenStyle = (token: Token, idx: number) => {
    const isDropHover =
      drag.isDragging &&
      drag.startSide === "source" &&
      side === "destination" &&
      drag.hoverIdx === idx;
    const isConnected =
      (side === "source" && connections.some((c) => c.sourceIdx === idx)) ||
      (side === "destination" && connections.some((c) => c.destIdx === idx));
    const isInAlignGroup = mainMode === "align" && isIdxInAnyGroup(idx);
    const ablated = isAblated(idx);
    const looped = isLooped(idx);
    return cn(
      tokenStyles.base,
      // priority: ablate > loop > mode visuals
      ablated && tokenStyles.ablate,
      !ablated && looped && tokenStyles.loop,
      // Connect mode visuals
      mainMode === "connect" && isConnected && tokenStyles.filled,
      mainMode === "connect" && isDropHover && tokenStyles.highlight,
      // Align mode visuals
      mainMode === "align" && isInAlignGroup && tokenStyles.filled,
      mainMode === "align" && !isInAlignGroup && isInLiveSelection(idx) && tokenStyles.highlight,
      tokenStyles.hover,
      token.text === "\\n" ? "w-full" : "w-fit",
      "cursor-pointer",
    );
  };

  const onMouseDown = (idx: number) => {
    if (mainMode === "connect") {
      if (subMode === "ablate") {
        toggleAblate(idx);
        return;
      }
      if (subMode === "loop") {
        toggleLoop(idx);
        return;
      }
      startConnection(side, idx);
      return;
    }
    if (mainMode === "align") {
      setIsSelecting(true);
      setSelectionStartIdx(idx);
      setSelectionHoverIdx(idx);
    }
  };

  const onMouseEnter = (idx: number) => {
    if (mainMode === "connect") {
      enterToken(side, idx);
    } else if (mainMode === "align" && isSelecting) {
      setSelectionHoverIdx(idx);
    }
  };

  const onMouseUp = (idx: number) => {
    if (mainMode === "connect") {
      endConnection(side, idx);
    } else if (mainMode === "align") {
      onSelectionEnd(idx);
    }
  };

  const tokenData = side === "source" ? sourceTokenData : destTokenData;

  return (
    <div
      className="max-h-40 overflow-y-auto w-full custom-scrollbar select-none whitespace-pre-wrap"
      style={{ display: "inline" }}
    >
      {tokenData.map((token, idx) => {
        const styles = getTokenStyle(token, idx);

        const { result, numNewlines } = fix(token.text);

        return (
          <span key={`token-${idx}`}>
            <span
              data-token-side={side}
              data-token-id={idx}
              className={styles}
              onMouseDown={() => onMouseDown(idx)}
              onMouseEnter={() => onMouseEnter(idx)}
              onMouseLeave={() => onMouseLeave()}
              onMouseUp={() => onMouseUp(idx)}
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
