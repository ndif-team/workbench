"use client";

import * as React from "react";
import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $getRoot,
  COMMAND_PRIORITY_LOW,
  DRAGOVER_COMMAND,
  DROP_COMMAND,
  ElementNode,
} from "lexical";
import { $createChartEmbedNode } from "../nodes/ChartEmbedNode";

// MIME type must match what sidebar sets
const CHART_MIME = "application/x-chart";

type ChartPayload = { chartId: string; chartType: "line" | "heatmap" | null };

export function DragDropChartPlugin() {
  const [editor] = useLexicalComposerContext();
  const indicatorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const rootElem = editor.getRootElement();
    if (!rootElem) return;

    // Create indicator
    const indicator = document.createElement("div");
    indicator.style.position = "absolute";
    indicator.style.height = "2px";
    indicator.style.background = "hsl(var(--primary))"; // ensure CSS var usage matches theme
    indicator.style.left = "0";
    indicator.style.right = "0";
    indicator.style.opacity = "0";
    indicator.style.pointerEvents = "none";
    indicator.style.transform = "translateY(-1px)";
    indicator.style.zIndex = "50";
    indicator.style.borderRadius = "1px";
    indicatorRef.current = indicator;

    // Append to nearest relatively positioned wrapper for correct coordinates
    const wrapper = rootElem.closest(".relative") ?? rootElem;
    wrapper.appendChild(indicator);

    const hideIndicator = () => {
      if (indicatorRef.current) indicatorRef.current.style.opacity = "0";
    };

    const positionIndicatorAtY = (clientY: number) => {
      const wrapperRect = wrapper.getBoundingClientRect();
      let topY = clientY;

      // Compute nearest block boundary using DOM rects for each top-level block
      editor.getEditorState().read(() => {
        const root = $getRoot();
        const children = root.getChildren();

        for (let i = 0; i < children.length; i++) {
          const block = children[i] as ElementNode;
          const elem = editor.getElementByKey(block.getKey());
          if (!elem) continue;
          const rect = elem.getBoundingClientRect();
          const mid = rect.top + rect.height / 2;
          if (clientY < mid) {
            topY = rect.top;
            break;
          }
          topY = rect.bottom; // default to after this block
        }

        const clamped = Math.max(wrapperRect.top, Math.min(topY, wrapperRect.bottom));
        const top = clamped - wrapperRect.top;
        if (indicatorRef.current) {
          indicatorRef.current.style.top = `${top}px`;
          indicatorRef.current.style.opacity = "1";
        }
      });
    };

    const unregisterDragOver = editor.registerCommand<DragEvent>(
      DRAGOVER_COMMAND,
      (event) => {
        if (!event.dataTransfer) return false;
        const hasChart = Array.from(event.dataTransfer.types).includes(CHART_MIME);
        if (!hasChart) {
          hideIndicator();
          return false;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        positionIndicatorAtY(event.clientY);
        return true;
      },
      COMMAND_PRIORITY_LOW
    );

    const unregisterDrop = editor.registerCommand<DragEvent>(
      DROP_COMMAND,
      (event) => {
        if (!event.dataTransfer) return false;
        const raw = event.dataTransfer.getData(CHART_MIME);
        if (!raw) {
          hideIndicator();
          return false;
        }
        event.preventDefault();

        let payload: ChartPayload | null = null;
        try {
          payload = JSON.parse(raw);
        } catch {
          payload = null;
        }
        if (!payload) {
          hideIndicator();
          return true;
        }

        const clientY = event.clientY;

        editor.update(() => {
          const root = $getRoot();
          const children = root.getChildren();

          // Decide insertion position relative to blocks
          let insertAfterIndex = -1; // -1 means insert at start
          for (let i = 0; i < children.length; i++) {
            const block = children[i] as ElementNode;
            const elem = editor.getElementByKey(block.getKey());
            if (!elem) continue;
            const rect = elem.getBoundingClientRect();
            const mid = rect.top + rect.height / 2;
            if (clientY < mid) {
              insertAfterIndex = i - 1;
              break;
            }
            insertAfterIndex = i; // will insert after last matched
          }

          const paragraph = $createParagraphNode();
          paragraph.append(
            $createChartEmbedNode({ chartId: payload!.chartId, chartType: payload!.chartType })
          );

          if (children.length === 0) {
            root.append(paragraph);
          } else if (insertAfterIndex < 0) {
            // insert at start
            const first = children[0];
            root.insertBefore(paragraph, first);
          } else if (insertAfterIndex >= children.length - 1) {
            // insert at end
            root.append(paragraph);
          } else {
            const refNode = children[insertAfterIndex];
            refNode.insertAfter(paragraph);
          }
        });

        hideIndicator();
        return true;
      },
      COMMAND_PRIORITY_LOW
    );

    const onDragLeave = (e: DragEvent) => {
      // Hide when leaving the editor wrapper
      const related = e.relatedTarget as Node | null;
      if (!wrapper.contains(related)) hideIndicator();
    };

    wrapper.addEventListener("dragleave", onDragLeave);

    const cleanup = () => {
      hideIndicator();
      indicator.remove();
      unregisterDragOver();
      unregisterDrop();
      wrapper.removeEventListener("dragleave", onDragLeave);
    };

    return cleanup;
  }, [editor]);

  return null;
}