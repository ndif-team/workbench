"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { SelectedComponent } from "./InteractiveTransformer";

interface EmbedComponentProps {
  numTokens: number;
  tokenLabels?: string[];
  theme?: string;
  scale: number;
  hoveredComponent: SelectedComponent | null;
  clickedComponent: SelectedComponent | null;
  setHoveredComponent: (component: SelectedComponent | null) => void;
  setClickedComponent: (component: SelectedComponent | null) => void;
  showFlowOnHover: boolean;
  highlightedComponents: Set<string> | null;
  dimensions: {
    embedWidth: number;
    labelPadding: number;
    startY: number;
    rowHeight: number;
  };
  colors: {
    blue: string;
    fills: {
      blue: string;
    };
  };
  strokeBase: string;
  fillBase: string;
}

export default function EmbedComponent({
  numTokens,
  tokenLabels,
  theme,
  scale,
  hoveredComponent,
  clickedComponent,
  setHoveredComponent,
  setClickedComponent,
  showFlowOnHover,
  highlightedComponents,
  dimensions,
  colors,
  strokeBase,
  fillBase,
}: EmbedComponentProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  // Main rendering effect
  useEffect(() => {
    if (!svgRef.current) return;

    // Clear any existing content
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current);

    // Calculate SVG dimensions
    const svgWidth = dimensions.embedWidth + dimensions.labelPadding;
    const svgHeight = dimensions.startY + numTokens * dimensions.rowHeight + 20;

    // Set SVG dimensions with scale
    svg.attr("width", svgWidth * scale).attr("height", svgHeight * scale);

    // Create a group for the visualization with scale transform
    const g = svg.append("g").attr("transform", `scale(${scale})`);

    // Function to add event handlers to components
    const addComponentHandlers = (
      element: d3.Selection<any, unknown, null, undefined>,
      tokenIndex: number,
    ) => {
      element
        .on("mouseenter", () => {
          // Only update hover if nothing is clicked
          if (!clickedComponent) {
            setHoveredComponent({
              tokenIndex,
              layerIndex: 0,
              componentType: "embed",
            });
          }
        })
        .on("mouseleave", () => {
          // Only clear hover if nothing is clicked
          if (!clickedComponent) {
            setHoveredComponent(null);
          }
        })
        .on("click", (event) => {
          event.stopPropagation();
          setClickedComponent({
            tokenIndex,
            layerIndex: 0,
            componentType: "embed",
          });
        });
    };

    // Draw embed components
    const trapezoidHeight = 20;
    const narrowWidth = 10;
    const wideWidth = 20;
    const embedX = dimensions.labelPadding + 20; // Position after labels

    // Draw for each token
    for (let tokenIndex = 0; tokenIndex < numTokens; tokenIndex++) {
      const embedY = dimensions.startY + tokenIndex * dimensions.rowHeight;
      const embedComponentId = `embed-${tokenIndex}`;
      const embedColor = colors.blue;

      // Draw trapezoid (wider side facing right)
      const trapezoidPath = `
        M ${embedX} ${embedY - narrowWidth / 2}
        L ${embedX + trapezoidHeight} ${embedY - wideWidth / 2}
        L ${embedX + trapezoidHeight} ${embedY + wideWidth / 2}
        L ${embedX} ${embedY + narrowWidth / 2}
        Z
      `;

      const embedShape = g
        .append("path")
        .attr("d", trapezoidPath)
        .attr("stroke", embedColor)
        .attr("stroke-width", 2)
        .attr("data-component-type", "embed")
        .attr("data-component-subtype", "shape")
        .attr("data-component-id", embedComponentId)
        .attr("fill", colors.fills.blue)
        .style("cursor", showFlowOnHover ? "pointer" : "default");

      // Add hover and click handlers
      if (showFlowOnHover) {
        addComponentHandlers(embedShape, tokenIndex);
      }

      // Arrow from embed
      const arrowStartX = embedX + trapezoidHeight;
      const arrowEndX = svgWidth - 10; // Stop near the edge
      const arrowY = embedY;

      g.append("line")
        .attr("x1", arrowStartX)
        .attr("y1", arrowY)
        .attr("x2", arrowEndX)
        .attr("y2", arrowY)
        .attr("stroke", embedColor)
        .attr("stroke-width", 2)
        .attr("data-component-type", "embed")
        .attr("data-component-subtype", "line")
        .attr("data-component-id", embedComponentId);

      // Arrow head
      const arrowHeadSize = 10;
      g.append("path")
        .attr(
          "d",
          `M ${arrowEndX - arrowHeadSize} ${arrowY - arrowHeadSize / 2} L ${arrowEndX} ${arrowY} L ${arrowEndX - arrowHeadSize} ${arrowY + arrowHeadSize / 2} Z`,
        )
        .attr("fill", embedColor)
        .attr("data-component-type", "embed")
        .attr("data-component-subtype", "filled")
        .attr("data-component-id", embedComponentId);
    }

    // Draw token labels
    if (tokenLabels && tokenLabels.length > 0) {
      for (let i = 0; i < numTokens && i < tokenLabels.length; i++) {
        const labelY = dimensions.startY + i * dimensions.rowHeight;
        const labelX = dimensions.labelPadding - 10; // Position to the left of embed

        g.append("text")
          .attr("x", labelX)
          .attr("y", labelY)
          .attr("text-anchor", "end")
          .attr("dominant-baseline", "middle")
          .attr("font-size", "14px")
          .attr("fill", theme === "dark" ? "#D1D5DB" : "#374151")
          .text(tokenLabels[i]);
      }
    }
  }, [numTokens, tokenLabels, theme, scale, dimensions, colors, showFlowOnHover, clickedComponent]);

  // Separate effect to update highlighting
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const g = svg.select("g");
    if (g.empty()) return;

    // Update all component colors based on highlighting
    g.selectAll("[data-component-id]").each(function () {
      const element = d3.select(this);
      const componentId = element.attr("data-component-id");
      const componentType = element.attr("data-component-type");

      if (!componentId || !componentType) return;

      // Apply colors based on highlighting state
      const isHighlighted = highlightedComponents
        ? highlightedComponents.has(componentId)
        : showFlowOnHover
          ? true
          : null;

      if (isHighlighted === null) return;

      // Use original colors with opacity for non-highlighted components
      const opacity = isHighlighted ? 1.0 : 0.15;
      const pathColor = colors.blue;
      const fillColor = colors.fills.blue;

      switch (element.attr("data-component-subtype")) {
        case "line":
          element.attr("stroke", pathColor);
          element.attr("opacity", opacity);
          break;
        case "shape":
          element.attr("fill", fillColor);
          element.attr("stroke", pathColor);
          element.attr("opacity", opacity);
          break;
        case "filled":
          element.attr("fill", pathColor);
          element.attr("stroke", pathColor);
          element.attr("opacity", opacity);
          break;
      }
    });
  }, [highlightedComponents, colors, strokeBase, fillBase, showFlowOnHover]);

  return <svg ref={svgRef}></svg>;
}
