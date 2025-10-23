"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect, useMemo, useState, useRef } from "react";
import {
  $createParagraphNode,
  $insertNodes,
  COMMAND_PRIORITY_LOW,
  $getSelection,
  $isRangeSelection,
} from "lexical";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getChartsMetadata } from "@/lib/queries/chartQueries";
import type { ChartMetadata } from "@/types/charts";
import { $createChartEmbedNode, INSERT_CHART_EMBED_COMMAND } from "../nodes/ChartEmbedNode";
import { LexicalTypeaheadMenuPlugin } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import {
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from "@lexical/react/LexicalTypeaheadMenuPlugin";
import * as ReactDOM from "react-dom";

export function SlashCommandPlugin() {
  const [editor] = useLexicalComposerContext();
  const params = useParams<{ workspaceId: string }>();
  const { data: charts } = useQuery({
    queryKey: ["basicChartsWithTool", params.workspaceId],
    queryFn: () => getChartsMetadata(params.workspaceId),
    staleTime: 30_000,
  });

  const [queryString, setQueryString] = useState<string | null>(null);

  const options = useMemo(() => {
    if (queryString === null) return [] as ChartOption[];
    const q = queryString.toLowerCase();
    return ((charts ?? []) as ChartMetadata[])
      .filter((c) => c.id.toLowerCase().includes(q))
      .slice(0, 10)
      .map((c) => new ChartOption(c));
  }, [charts, queryString]);

  // Stable rect while menu is open to avoid reflow/reposition on interactions
  const menuRectRef = useRef<{ top: number; left: number; height: number } | null>(null);

  // Close the portal on document resize to avoid stale positioning
  useEffect(() => {
    function handleResize() {
      setQueryString(null);
      menuRectRef.current = null;
    }
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    // Handle insert command by inserting our custom node
    return editor.registerCommand(
      INSERT_CHART_EMBED_COMMAND,
      (payload) => {
        editor.update(() => {
          const node = $createChartEmbedNode({
            chartId: payload.chart.id,
            chartType: payload.chart.type,
          });
          $insertNodes([node]);
          // Insert an empty paragraph after so the user can continue typing
          const paragraph = $createParagraphNode();
          node.insertAfter(paragraph);
          paragraph.select();
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  const triggerFn = useBasicTypeaheadTriggerMatch("/", { minLength: 0, maxLength: 50 });

  return (
    <LexicalTypeaheadMenuPlugin
      onQueryChange={setQueryString}
      triggerFn={triggerFn}
      options={options}
      onClose={() => {
        menuRectRef.current = null;
      }}
      onSelectOption={(option, _nodeToReplace, closeMenu) => {
        if (!(option instanceof ChartOption)) return;
        closeMenu();
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const toDelete = (queryString ?? "").length + 1; // include '/'
            for (let i = 0; i < toDelete; i++) {
              selection.deleteCharacter(true);
            }
            const node = $createChartEmbedNode({
              chartId: option.chart.id,
              chartType: option.chart.chartType,
            });
            $insertNodes([node]);
            const paragraph = $createParagraphNode();
            node.insertAfter(paragraph);
            paragraph.select();
          }
        });
      }}
      menuRenderFn={(
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
      ) => {
        // If menu is not open or there are no options, don't render
        if (!anchorElementRef.current || options.length === 0) {
          menuRectRef.current = null;
          return null;
        }

        // Compute position directly from the current caret rect once per open
        const rect = anchorElementRef.current.getBoundingClientRect();
        if (!menuRectRef.current && rect.top > 0 && rect.left >= 0) {
          menuRectRef.current = { top: rect.top, left: rect.left, height: rect.height };
        }
        const stableRect = menuRectRef.current ?? rect;
        if (stableRect.top === 0 && stableRect.left === 0) {
          return null;
        }
        const menuTop = stableRect.top + stableRect.height + 4;
        const menuLeft = stableRect.left;
        return ReactDOM.createPortal(
          <div
            className="z-50 bg-popover text-popover-foreground border rounded-md shadow-md p-1 max-h-60 overflow-auto min-w-[260px]"
            style={{ position: "fixed", top: menuTop, left: menuLeft }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {options.map((opt, i) => {
              const active = i === selectedIndex;
              return (
                <div
                  key={opt.key}
                  role="option"
                  aria-selected={active}
                  className={`px-3 py-2.5 text-sm cursor-pointer flex items-center justify-between rounded ${active ? "bg-accent text-accent-foreground" : ""}`}
                  onMouseEnter={() => setHighlightedIndex(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectOptionAndCleanUp(opt)}
                >
                  <span className="truncate mr-3">{opt.chart.name ?? "Untitled"}</span>
                  <span className="text-xs text-muted-foreground">
                    {opt.chart.chartType ?? "unknown"}{" "}
                    {opt.chart.toolType ? `· ${opt.chart.toolType}` : ""}
                  </span>
                </div>
              );
            })}
            {options.length === 0 && (
              <div className="px-3 py-2.5 text-sm text-muted-foreground">No charts found.</div>
            )}
          </div>,
          document.body,
        );
      }}
    />
  );
}

class ChartOption extends MenuOption {
  chart: ChartMetadata;
  constructor(chart: ChartMetadata) {
    super(chart.id);
    this.chart = chart;
  }
}
