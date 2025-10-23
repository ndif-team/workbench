"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { SelectedComponent } from "./InteractiveTransformer";

interface UnembedComponentProps {
    numTokens: number;
    numLayers: number;
    unembedLabels?: string[];
    theme?: string;
    scale: number;
    hoveredComponent: SelectedComponent | null;
    clickedComponent: SelectedComponent | null;
    setHoveredComponent: (component: SelectedComponent | null) => void;
    setClickedComponent: (component: SelectedComponent | null) => void;
    showFlowOnHover: boolean;
    highlightedComponents: Set<string> | null;
    dimensions: {
        unembedWidth: number;
        rightLabelPadding: number;
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

export default function UnembedComponent({
    numTokens,
    numLayers,
    unembedLabels,
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
}: UnembedComponentProps) {
    const svgRef = useRef<SVGSVGElement>(null);

    // Main rendering effect
    useEffect(() => {
        if (!svgRef.current) return;

        // Clear any existing content
        d3.select(svgRef.current).selectAll("*").remove();

        const svg = d3.select(svgRef.current);

        // Calculate SVG dimensions
        const svgWidth = dimensions.unembedWidth + dimensions.rightLabelPadding;
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
                            layerIndex: numLayers - 1,
                            componentType: "unembed",
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
                        layerIndex: numLayers - 1,
                        componentType: "unembed",
                    });
                });
        };

        // Draw unembed components
        const trapezoidHeight = 20;
        const narrowWidth = 10;
        const wideWidth = 20;
        const unembedX = 20; // Position at the start of the component

        // Draw for each token
        for (let tokenIndex = 0; tokenIndex < numTokens; tokenIndex++) {
            const unembedY = dimensions.startY + tokenIndex * dimensions.rowHeight;
            const unembedComponentId = `unembed-${tokenIndex}`;

            // Draw trapezoid (wider side facing left)
            const trapezoidPath = `
        M ${unembedX} ${unembedY - wideWidth / 2}
        L ${unembedX + trapezoidHeight} ${unembedY - narrowWidth / 2}
        L ${unembedX + trapezoidHeight} ${unembedY + narrowWidth / 2}
        L ${unembedX} ${unembedY + wideWidth / 2}
        Z
      `;

            const unembedShape = g
                .append("path")
                .attr("d", trapezoidPath)
                .attr("stroke", colors.blue)
                .attr("stroke-width", 2)
                .attr("data-component-type", "unembed")
                .attr("data-component-subtype", "shape")
                .attr("data-component-id", unembedComponentId)
                .attr("fill", colors.fills.blue)
                .style("cursor", showFlowOnHover ? "pointer" : "default");

            // Add hover and click handlers
            if (showFlowOnHover) {
                addComponentHandlers(unembedShape, tokenIndex);
            }
        }

        // Draw unembed labels
        if (unembedLabels && unembedLabels.length > 0) {
            for (let i = 0; i < numTokens && i < unembedLabels.length; i++) {
                const labelY = dimensions.startY + i * dimensions.rowHeight;
                const labelX = unembedX + trapezoidHeight + 30; // Position to the right of unembed

                g.append("text")
                    .attr("x", labelX)
                    .attr("y", labelY)
                    .attr("text-anchor", "start")
                    .attr("dominant-baseline", "middle")
                    .attr("font-size", "14px")
                    .attr("fill", theme === "dark" ? "#D1D5DB" : "#374151")
                    .text(unembedLabels[i]);
            }
        }
    }, [
        numTokens,
        numLayers,
        unembedLabels,
        theme,
        scale,
        dimensions,
        colors,
        showFlowOnHover,
        clickedComponent,
    ]);

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
