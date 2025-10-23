"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3";
import { useTheme } from "next-themes";
import EmbedComponent from "./EmbedComponent";
import UnembedComponent from "./UnembedComponent";
import { ScrollArea, ScrollBar } from "../ui/scroll-area";

export interface SelectedComponent {
    tokenIndex: number;
    layerIndex: number;
    componentType: "resid" | "attn" | "mlp" | "embed" | "unembed";
}

interface LensTransformerProps {
    clickedComponent: SelectedComponent | null;
    setClickedComponent: (component: SelectedComponent | null) => void;
    numTokens?: number;
    layerRange: [number, number]; // [start, end] inclusive
    showAttn?: boolean;
    showMlp?: boolean;
    scale?: number;
    tokenLabels?: string[];
    unembedLabels?: string[];
    showFlowOnHover?: boolean;
    rowMode?: boolean;
}

// Function to get all components that should be highlighted for a given selection
const getDataFlowComponents = (
    selected: SelectedComponent,
    showAttn: boolean,
    showMlp: boolean,
    numLayers: number,
    rowMode: boolean,
): Set<string> => {
    const highlighted = new Set<string>();

    const { tokenIndex, layerIndex, componentType } = selected;

    if (rowMode) {
        for (let l = 0; l < numLayers; l++) {
            highlighted.add(`resid-circle-${tokenIndex}-${l}`);
            highlighted.add(`resid-arrow-${tokenIndex}-${l}`);
            highlighted.add(`cross-token-attn-${tokenIndex}-${l}`);
            if (showAttn) highlighted.add(`attn-${tokenIndex}-${l}`);
            if (showMlp) highlighted.add(`mlp-${tokenIndex}-${l}`);
        }
        highlighted.add(`embed-${tokenIndex}`);
        highlighted.add(`unembed-${tokenIndex}`);
        return highlighted;
    }

    // Embed components have no dependencies
    if (componentType === "embed") {
        highlighted.add(`embed-${tokenIndex}`);
        return highlighted;
    }

    // Unembed components see everything
    if (componentType === "unembed") {
        for (let t = 0; t <= tokenIndex; t++) {
            for (let l = 0; l < layerIndex; l++) {
                highlighted.add(`resid-circle-${t}-${l}`);
                highlighted.add(`resid-arrow-${t}-${l}`);
                highlighted.add(`cross-token-attn-${t}-${l}`);
                if (showAttn) highlighted.add(`attn-${t}-${l}`);
                if (showMlp) highlighted.add(`mlp-${t}-${l}`);
            }

            // Highlight resid circles and cross-token attn for the curent layer
            highlighted.add(`resid-circle-${t}-${layerIndex}`);
            highlighted.add(`cross-token-attn-${t}-${layerIndex}`);

            // Highlight the current token's components
            highlighted.add(`resid-arrow-${tokenIndex}-${layerIndex}`);
            if (showAttn) highlighted.add(`attn-${tokenIndex}-${layerIndex}`);
            if (showMlp) highlighted.add(`mlp-${tokenIndex}-${layerIndex}`);

            // Highlight the embed components up to the current token
            highlighted.add(`embed-${t}`);
        }
        highlighted.add(`unembed-${tokenIndex}`);
        return highlighted;
    }

    // For residual components
    if (componentType === "resid") {
        // Add all previous layers
        for (let l = 0; l < layerIndex; l++) {
            for (let t = 0; t <= tokenIndex; t++) {
                highlighted.add(`resid-circle-${t}-${l}`);
                highlighted.add(`embed-${t}`);
                highlighted.add(`cross-token-attn-${t}-${l}`);

                if (l !== layerIndex - 1) {
                    highlighted.add(`resid-arrow-${t}-${l}`);
                    if (showAttn) highlighted.add(`attn-${t}-${l}`);
                    if (showMlp) highlighted.add(`mlp-${t}-${l}`);
                }
            }
        }

        highlighted.add(`resid-arrow-${tokenIndex}-${layerIndex - 1}`);
        if (showAttn) highlighted.add(`attn-${tokenIndex}-${layerIndex - 1}`);
        if (showMlp) highlighted.add(`mlp-${tokenIndex}-${layerIndex - 1}`);

        highlighted.add(`resid-circle-${tokenIndex}-${layerIndex}`);
        highlighted.add(`resid-arrow-${tokenIndex}-${layerIndex}`);

        if (layerIndex === 0) {
            highlighted.add(`embed-${tokenIndex}`);
        }
    }

    // For attention and MLP components: add all components in previous layers (all tokens)
    if (componentType === "attn" || componentType === "mlp") {
        for (let l = 0; l < layerIndex; l++) {
            for (let t = 0; t <= tokenIndex; t++) {
                highlighted.add(`resid-circle-${t}-${l}`);
                highlighted.add(`resid-arrow-${t}-${l}`);
                highlighted.add(`embed-${t}`);
                highlighted.add(`cross-token-attn-${t}-${l}`);
                if (showAttn) highlighted.add(`attn-${t}-${l}`);
                if (showMlp) highlighted.add(`mlp-${t}-${l}`);
            }
        }
    }

    // For attention and MLP: add residual circles in current layer for previous tokens
    if (componentType === "attn" || componentType === "mlp") {
        for (let t = 0; t <= tokenIndex; t++) {
            highlighted.add(`resid-circle-${t}-${layerIndex}`);
        }
        // // Add the residual circle at the current token position
        highlighted.add(`resid-arrow-${tokenIndex}-${layerIndex}`);

        // Add cross-token attention components to the current token
        for (let t = 0; t <= tokenIndex; t++) {
            highlighted.add(`cross-token-attn-${t}-${layerIndex}`);
        }
    }

    // For MLP: also add the attention component at the same position
    if (componentType === "mlp" && showAttn) {
        highlighted.add(`attn-${tokenIndex}-${layerIndex}`);
        highlighted.add(`mlp-${tokenIndex}-${layerIndex}`);
    }

    // For attention: include the attention component itself
    if (componentType === "attn") {
        highlighted.add(`attn-${tokenIndex}-${layerIndex}`);
    }

    return highlighted;
};

export default function LensTransformer({
    clickedComponent,
    setClickedComponent,
    numTokens = 2,
    layerRange,
    showAttn = true,
    showMlp = true,
    scale = 1,
    tokenLabels,
    unembedLabels,
    showFlowOnHover = false,
    rowMode = false,
}: LensTransformerProps) {
    const { theme } = useTheme();
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [hoveredComponent, setHoveredComponent] = useState<SelectedComponent | null>(null);

    const STROKE_BASE = theme === "dark" ? "#374151" : "#E5E7EB";
    const FILL_BASE = theme === "dark" ? "#1F2937" : "#F3F4F6";

    // Theme-aware colors
    const COLORS = {
        purple: theme === "dark" ? "#A855F7" : "#8B5CF6",
        red: theme === "dark" ? "#EF4444" : "#DC2626",
        green: theme === "dark" ? "#22C55E" : "#16A34A",
        blue: theme === "dark" ? "#3B82F6" : "#2563EB",
        fills: {
            purple: theme === "dark" ? "#2D1B69" : "#E9D5FF",
            red: theme === "dark" ? "#7F1D1D" : "#FEE2E2",
            green: theme === "dark" ? "#14532D" : "#DCFCE7",
            blue: theme === "dark" ? "#1E3A8A" : "#DBEAFE",
        },
    };

    // Determine which component is currently selected
    const activeComponent = clickedComponent || hoveredComponent;

    const numLayers = layerRange[1] - layerRange[0] + 1;

    // Get the set of components that should be highlighted
    const highlightedComponents = useMemo(() => {
        return activeComponent
            ? getDataFlowComponents(activeComponent, showAttn, showMlp, numLayers, rowMode)
            : null;
    }, [activeComponent, showAttn, showMlp, numLayers, rowMode]);

    // SVG dimensions calculation
    const dimensions = useMemo(() => {
        const layerWidth = 210;
        const rowHeight = 75;
        const startY = 50;
        const layersWidth = numLayers * layerWidth + 20; // +20 for padding (10 each side)
        const baseHeight = startY + numTokens * rowHeight + 20;

        return {
            layerWidth,
            layersWidth,
            rowHeight,
            baseHeight,
            startY,
        };
    }, [numLayers, numTokens]);

    // Main rendering effect
    useEffect(() => {
        if (!svgRef.current) return;

        // Function to add event handlers to components
        const addComponentHandlers = (
            element: d3.Selection<any, unknown, null, undefined>,
            tokenIndex: number,
            layerIndex: number,
            componentType: "resid" | "attn" | "mlp" | "embed" | "unembed",
        ) => {
            element
                .on("mouseenter", () => {
                    // Only update hover if nothing is clicked
                    if (!clickedComponent) {
                        setHoveredComponent({
                            tokenIndex,
                            layerIndex,
                            componentType,
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
                        layerIndex,
                        componentType,
                    });
                });
        };

        // Clear any existing content
        d3.select(svgRef.current).selectAll("*").remove();

        const svg = d3.select(svgRef.current);

        // Set SVG dimensions with scale - only for layers
        svg.attr("width", dimensions.layersWidth * scale).attr(
            "height",
            dimensions.baseHeight * scale,
        );

        // Add background rect to capture mouse events on empty space
        if (showFlowOnHover) {
            svg.append("rect")
                .attr("width", dimensions.layersWidth * scale)
                .attr("height", dimensions.baseHeight * scale)
                .attr("fill", "transparent")
                .style("cursor", "default")
                .on("mouseenter", () => {
                    // Only clear hover if nothing is clicked
                    if (!clickedComponent) {
                        setHoveredComponent(null);
                    }
                })
                .on("click", (event) => {
                    event.stopPropagation();
                    setClickedComponent(null);
                });
        }

        // Create a group for the visualization with scale transform
        const g = svg.append("g").attr("transform", `scale(${scale})`);

        // Function to draw a single layer
        const drawLayer = (layerIndex: number) => {
            const layerStartX = 12 + (layerIndex - layerRange[0]) * dimensions.layerWidth; // Add 10px padding for circles

            // Function to draw a single token row within a layer
            const drawTokenRow = (rowIndex: number) => {
                const centerX = layerStartX;
                const centerY = dimensions.startY + rowIndex * dimensions.rowHeight;
                const isFirstRow = rowIndex === 0;
                const isLastRow = rowIndex === numTokens - 1;

                // Residual-in circle
                const residInRadius = 10;
                const residCircleId = `resid-circle-${rowIndex}-${layerIndex}`;
                const residArrowId = `resid-arrow-${rowIndex}-${layerIndex}`;
                const residColor = COLORS.purple;

                const residCircle = g
                    .append("circle")
                    .attr("cx", centerX)
                    .attr("cy", centerY)
                    .attr("r", residInRadius)
                    .attr("stroke", residColor)
                    .attr("stroke-width", 2)
                    .attr("data-component-type", "resid")
                    .attr("data-component-subtype", "shape")
                    .attr("data-component-id", residCircleId)
                    .attr("fill", COLORS.fills.purple)
                    .style("cursor", showFlowOnHover ? "pointer" : "default");

                // Add hover and click handlers
                if (showFlowOnHover) {
                    addComponentHandlers(residCircle, rowIndex, layerIndex, "resid");
                }

                // Residual arrow that components within the layer (attn, mlp) add to
                const residArrowStartX = centerX + residInRadius;
                const residArrowEndX = centerX + residInRadius + 200;
                const residArrowY = centerY;

                // If not the last layer, connect to the next layer's circle minus its radius
                // If last layer, keep the same arrow length (use residArrowEndX)
                const isLastLayer = layerIndex === layerRange[1];
                const actualResidArrowEndX = isLastLayer
                    ? residArrowEndX
                    : 12 + (layerIndex - layerRange[0] + 1) * dimensions.layerWidth - residInRadius;

                // Residual arrow color: use standard component color logic
                const residArrowColor = COLORS.purple;

                // Residual arrow line
                g.append("line")
                    .attr("x1", residArrowStartX)
                    .attr("y1", residArrowY)
                    .attr("x2", actualResidArrowEndX)
                    .attr("y2", residArrowY)
                    .attr("stroke", residArrowColor)
                    .attr("stroke-width", 2)
                    .attr("data-component-type", "resid")
                    .attr("data-component-subtype", "line")
                    .attr("data-component-id", residArrowId);

                // Residual arrow head (for all layers)
                const arrowHeadSize = 10;
                const arrowHeadX = actualResidArrowEndX;
                g.append("path")
                    .attr(
                        "d",
                        `M ${arrowHeadX - arrowHeadSize} ${residArrowY - arrowHeadSize / 2} L ${arrowHeadX} ${residArrowY} L ${arrowHeadX - arrowHeadSize} ${residArrowY + arrowHeadSize / 2} Z`,
                    )
                    .attr("fill", residArrowColor)
                    .attr("data-component-type", "resid")
                    .attr("data-component-subtype", "filled")
                    .attr("data-component-id", residArrowId);

                // A semi-circle path around the residual-in circle (only if not the first row)
                const attnCrossTokenRadius = 20;
                const attnComponentId = `attn-${rowIndex}-${layerIndex}`;
                const attnColor = COLORS.red;

                // Cross-token arrows use red as default color

                if (showAttn && !isFirstRow) {
                    const attnCrossTokenRoundedPath = `M ${centerX} ${centerY - attnCrossTokenRadius} A ${attnCrossTokenRadius} ${attnCrossTokenRadius} 0 0 1 ${centerX} ${centerY + attnCrossTokenRadius}`;
                    // This semicircle is at the current row and connects to this row's attention
                    const crossTokenId = `cross-token-attn-${rowIndex}-${layerIndex}`;
                    const crossTokenColor = COLORS.red;

                    g.append("path")
                        .attr("d", attnCrossTokenRoundedPath)
                        .attr("fill", "none")
                        .attr("stroke", crossTokenColor)
                        .attr("stroke-width", 2)
                        .attr("data-component-type", "cross-token")
                        .attr("data-component-subtype", "line")
                        .attr("data-component-id", crossTokenId);
                }

                // Arrow that continues the connection to the next token
                if (showAttn && !isLastRow) {
                    const attnCrossTokenX = centerX;
                    const attnCrossTokenStartY = centerY + residInRadius;
                    const nextRowCenterY =
                        dimensions.startY + (rowIndex + 1) * dimensions.rowHeight;
                    const attnCrossTokenEndY = nextRowCenterY - attnCrossTokenRadius;
                    const crossTokenColor = COLORS.red;

                    // Cross token arrow line
                    const crossTokenId = `cross-token-attn-${rowIndex}-${layerIndex}`;
                    g.append("line")
                        .attr("x1", attnCrossTokenX)
                        .attr("y1", attnCrossTokenStartY)
                        .attr("x2", attnCrossTokenX)
                        .attr("y2", attnCrossTokenEndY)
                        .attr("stroke", crossTokenColor)
                        .attr("stroke-width", 2)
                        .attr("data-component-type", "cross-token")
                        .attr("data-component-subtype", "line")
                        .attr("data-component-id", crossTokenId);

                    // Cross token arrow head (pointing down, at the end of the line)
                    g.append("path")
                        .attr(
                            "d",
                            `M ${attnCrossTokenX - arrowHeadSize / 2} ${attnCrossTokenEndY - arrowHeadSize} L ${attnCrossTokenX} ${attnCrossTokenEndY} L ${attnCrossTokenX + arrowHeadSize / 2} ${attnCrossTokenEndY - arrowHeadSize} Z`,
                        )
                        .attr("fill", crossTokenColor)
                        .attr("data-component-type", "cross-token")
                        .attr("data-component-subtype", "filled")
                        .attr("data-component-id", crossTokenId);
                } else if (showAttn) {
                    // If the last row, we need to draw a cross token arrow that just goes from resid-in to the y level of attn-in
                    const attnCrossTokenX = centerX;
                    const attnCrossTokenStartY = centerY + residInRadius;
                    const attnCrossTokenEndY = centerY + residInRadius + 20;
                    const crossTokenColor = COLORS.red;

                    // Cross token arrow line (last row case)
                    const crossTokenId = `cross-token-attn-${rowIndex}-${layerIndex}`;
                    g.append("line")
                        .attr("x1", attnCrossTokenX)
                        .attr("y1", attnCrossTokenStartY)
                        .attr("x2", attnCrossTokenX)
                        .attr("y2", attnCrossTokenEndY)
                        .attr("stroke", crossTokenColor)
                        .attr("stroke-width", 2)
                        .attr("data-component-type", "cross-token")
                        .attr("data-component-subtype", "line")
                        .attr("data-component-id", crossTokenId);
                }

                // Attn in arrow line variables
                const attnInXStart = centerX;
                const attnXEndOffset = 75;
                const attnInXEnd = centerX + attnXEndOffset;
                const componentY = centerY + residInRadius + 20;

                // Attn in arrow line. This connects from the cross token residual information into the attention component
                if (showAttn) {
                    g.append("line")
                        .attr("x1", attnInXStart)
                        .attr("y1", componentY)
                        .attr("x2", attnInXEnd)
                        .attr("y2", componentY)
                        .attr("stroke", attnColor)
                        .attr("stroke-width", 2)
                        .attr("data-component-type", "attn")
                        .attr("data-component-subtype", "line")
                        .attr("data-component-id", attnComponentId);

                    // Attn out arrow line variables
                    const attnOutX = attnInXEnd;
                    const attnOutYStart = componentY;
                    const attnOutYEnd = residArrowY;

                    // Attn out arrow line
                    g.append("line")
                        .attr("x1", attnOutX)
                        .attr("y1", attnOutYStart)
                        .attr("x2", attnOutX)
                        .attr("y2", attnOutYEnd)
                        .attr("stroke", attnColor)
                        .attr("stroke-width", 2)
                        .attr("data-component-type", "attn")
                        .attr("data-component-subtype", "line")
                        .attr("data-component-id", attnComponentId);

                    // Attn out arrow head (pointing up, at the end of the line)
                    g.append("path")
                        .attr(
                            "d",
                            `M ${attnOutX - arrowHeadSize / 2} ${attnOutYEnd + arrowHeadSize} L ${attnOutX} ${attnOutYEnd} L ${attnOutX + arrowHeadSize / 2} ${attnOutYEnd + arrowHeadSize} Z`,
                        )
                        .attr("fill", attnColor)
                        .attr("data-component-type", "attn")
                        .attr("data-component-subtype", "filled")
                        .attr("data-component-id", attnComponentId);

                    // Attention square
                    const attnWidth = 20;
                    const attnHeight = 20;
                    const attnX = centerX + attnXEndOffset / 2 - attnWidth / 2;
                    const attnY = componentY - attnHeight / 2;

                    const attnRect = g
                        .append("rect")
                        .attr("x", attnX)
                        .attr("y", attnY)
                        .attr("width", attnWidth)
                        .attr("height", attnHeight)
                        .attr("stroke", attnColor)
                        .attr("stroke-width", 2)
                        .attr("data-component-type", "attn")
                        .attr("data-component-subtype", "shape")
                        .attr("data-component-id", attnComponentId)
                        .attr("fill", COLORS.fills.red)
                        .style("cursor", showFlowOnHover ? "pointer" : "default");

                    // Add hover and click handlers
                    if (showFlowOnHover) {
                        addComponentHandlers(attnRect, rowIndex, layerIndex, "attn");
                    }
                }

                // MLP components
                if (showMlp) {
                    const mlpComponentId = `mlp-${rowIndex}-${layerIndex}`;
                    const mlpColor = COLORS.green;

                    // MLP in arrow line variables
                    const mlpInX = attnInXEnd + 25;
                    const mlpInYStart = residArrowY;
                    const mlpInYEnd = componentY;

                    // MLP in arrow line
                    g.append("line")
                        .attr("x1", mlpInX)
                        .attr("y1", mlpInYStart)
                        .attr("x2", mlpInX)
                        .attr("y2", mlpInYEnd)
                        .attr("stroke", mlpColor)
                        .attr("stroke-width", 2)
                        .attr("data-component-type", "mlp")
                        .attr("data-component-subtype", "line")
                        .attr("data-component-id", mlpComponentId);

                    // MLP out arrow line variables
                    const mlpOutX = attnInXEnd + 100;
                    const mlpOutYStart = componentY;
                    const mlpOutYEnd = residArrowY;

                    // MLP out arrow line
                    g.append("line")
                        .attr("x1", mlpOutX)
                        .attr("y1", mlpOutYStart)
                        .attr("x2", mlpOutX)
                        .attr("y2", mlpOutYEnd)
                        .attr("stroke", mlpColor)
                        .attr("stroke-width", 2)
                        .attr("data-component-type", "mlp")
                        .attr("data-component-subtype", "filled")
                        .attr("data-component-id", mlpComponentId);

                    // MLP out arrow connecting the MLP information back to the residual stream
                    g.append("path")
                        .attr(
                            "d",
                            `M ${mlpOutX - arrowHeadSize / 2} ${mlpOutYEnd + arrowHeadSize} L ${mlpOutX} ${mlpOutYEnd} L ${mlpOutX + arrowHeadSize / 2} ${mlpOutYEnd + arrowHeadSize} Z`,
                        )
                        .attr("fill", mlpColor)
                        .attr("data-component-type", "mlp")
                        .attr("data-component-subtype", "filled")
                        .attr("data-component-id", mlpComponentId);

                    // Line visually bridging the MLP-in and MLP-out arrows
                    g.append("line")
                        .attr("x1", mlpInX)
                        .attr("y1", mlpInYEnd)
                        .attr("x2", mlpOutX)
                        .attr("y2", mlpOutYStart)
                        .attr("stroke", mlpColor)
                        .attr("stroke-width", 2)
                        .attr("data-component-type", "mlp")
                        .attr("data-component-subtype", "line")
                        .attr("data-component-id", mlpComponentId);

                    // MLP diamond
                    const mlpWidth = 20;
                    const mlpHeight = 20;
                    // Offset is distance between in and out lines, minus half the width of the square
                    const mlpOffset = (mlpOutX - mlpInX) / 2 - mlpWidth / 2;
                    const mlpX = mlpInX + mlpOffset;
                    const mlpY = componentY - mlpHeight / 2;

                    const mlpRect = g
                        .append("rect")
                        .attr("x", mlpX)
                        .attr("y", mlpY)
                        .attr("width", mlpWidth)
                        .attr("height", mlpHeight)
                        .attr("stroke", mlpColor)
                        .attr("stroke-width", 2)
                        .attr(
                            "transform",
                            `rotate(45, ${mlpX + mlpWidth / 2}, ${mlpY + mlpHeight / 2})`,
                        )
                        .attr("data-component-type", "mlp")
                        .attr("data-component-subtype", "shape")
                        .attr("data-component-id", mlpComponentId)
                        .attr("fill", COLORS.fills.green)
                        .style("cursor", showFlowOnHover ? "pointer" : "default");

                    // Add hover and click handlers
                    if (showFlowOnHover) {
                        addComponentHandlers(mlpRect, rowIndex, layerIndex, "mlp");
                    }
                }

                // Row hitbox moved outside of layer loop to avoid duplication
            };

            // Draw all token rows for this layer
            for (let i = 0; i < numTokens; i++) {
                drawTokenRow(i);
            }
        };

        // Draw layer indices at the top
        if (numTokens > 0) {
            const layerLabelY = 20; // Position above the visualization
            for (let i = layerRange[0]; i <= layerRange[1]; i++) {
                const visualIndex = i - layerRange[0];
                const layerCenterX = 12 + visualIndex * dimensions.layerWidth;
                g.append("text")
                    .attr("x", layerCenterX)
                    .attr("y", layerLabelY)
                    .attr("text-anchor", "middle")
                    .attr("dominant-baseline", "middle")
                    .attr("font-size", "12px")
                    .attr("fill", theme === "dark" ? "#9CA3AF" : "#6B7280")
                    .attr("font-weight", "500")
                    .text(i);
            }
        }

        // Draw all layers
        for (let i = layerRange[0]; i <= layerRange[1]; i++) {
            drawLayer(i);
        }

        // Add row hitboxes for row mode (after all layers to avoid duplication)
        if (rowMode && showFlowOnHover) {
            for (let rowIndex = 0; rowIndex < numTokens; rowIndex++) {
                const hitboxY =
                    dimensions.startY + rowIndex * dimensions.rowHeight - dimensions.rowHeight / 2;
                const rowHitbox = g
                    .append("rect")
                    .attr("x", 0)
                    .attr("y", hitboxY)
                    .attr("width", dimensions.layersWidth)
                    .attr("height", dimensions.rowHeight)
                    .attr("fill", "transparent")
                    .attr("stroke", "none")
                    .style("cursor", "pointer");

                // Add handlers - use 'resid' as component type since it triggers row highlighting in row mode
                addComponentHandlers(rowHitbox, rowIndex, layerRange[0], "resid");
            }
        }
    }, [
        dimensions,
        numTokens,
        layerRange,
        showAttn,
        showMlp,
        scale,
        showFlowOnHover,
        theme,
        rowMode,
        clickedComponent,
    ]);

    // Separate effect to update highlighting without rebuilding the SVG
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

            // Determine colors based on component type
            let defaultColor = COLORS.purple;
            let highlightedFillColor = COLORS.fills.purple;

            if (componentType === "attn" || componentType === "cross-token") {
                defaultColor = COLORS.red;
                highlightedFillColor = COLORS.fills.red;
            } else if (componentType === "mlp") {
                defaultColor = COLORS.green;
                highlightedFillColor = COLORS.fills.green;
            } else if (componentType === "embed" || componentType === "unembed") {
                defaultColor = COLORS.blue;
                highlightedFillColor = COLORS.fills.blue;
            }

            // Apply colors based on highlighting state
            // When highlightedComponents is null and showFlowOnHover is off, preserve current state
            // When highlightedComponents is null and showFlowOnHover is on, show all as highlighted
            const isHighlighted = highlightedComponents
                ? highlightedComponents.has(componentId)
                : showFlowOnHover
                  ? true
                  : null; // null means preserve current state

            // If isHighlighted is null, don't update colors (preserve current state)
            if (isHighlighted === null) return;

            // Use original colors with opacity for non-highlighted components
            const opacity = isHighlighted ? 1.0 : 0.15;
            const pathColor = defaultColor;
            const fillColor = highlightedFillColor;

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

        // Remove any existing stroke (cleanup)
        g.selectAll(".row-stroke").remove();
    }, [highlightedComponents, theme, showFlowOnHover, rowMode, dimensions]);

    return (
        <div className="flex items-cener justify-center rounded relative">
            {/* Embed component - fixed width */}
            <div className="flex-shrink-0">
                <EmbedComponent
                    numTokens={numTokens}
                    tokenLabels={tokenLabels}
                    theme={theme}
                    scale={scale}
                    hoveredComponent={hoveredComponent}
                    clickedComponent={clickedComponent}
                    setHoveredComponent={setHoveredComponent}
                    setClickedComponent={setClickedComponent}
                    showFlowOnHover={showFlowOnHover}
                    highlightedComponents={highlightedComponents}
                    dimensions={{
                        embedWidth: 75,
                        labelPadding: tokenLabels ? 100 : 0,
                        startY: dimensions.startY,
                        rowHeight: dimensions.rowHeight,
                    }}
                    colors={COLORS}
                    strokeBase={STROKE_BASE}
                    fillBase={FILL_BASE}
                />
            </div>

            {/* Layers - scrollable */}
            <ScrollArea
                ref={containerRef}
                className="flex-shrink-0"
                style={{ width: `${(4 * 210 + 1) * scale}px` }}
            >
                <svg ref={svgRef}></svg>
                <ScrollBar orientation="horizontal" className="hidden" />
            </ScrollArea>

            {/* Unembed component - fixed width */}
            <div className="flex-shrink-0">
                <UnembedComponent
                    numTokens={numTokens}
                    numLayers={numLayers}
                    unembedLabels={unembedLabels}
                    theme={theme}
                    scale={scale}
                    hoveredComponent={hoveredComponent}
                    clickedComponent={clickedComponent}
                    setHoveredComponent={setHoveredComponent}
                    setClickedComponent={setClickedComponent}
                    showFlowOnHover={showFlowOnHover}
                    highlightedComponents={highlightedComponents}
                    dimensions={{
                        unembedWidth: 75,
                        rightLabelPadding: unembedLabels ? 100 : 0,
                        startY: dimensions.startY,
                        rowHeight: dimensions.rowHeight,
                    }}
                    colors={COLORS}
                    strokeBase={STROKE_BASE}
                    fillBase={FILL_BASE}
                />
            </div>
        </div>
    );
}
