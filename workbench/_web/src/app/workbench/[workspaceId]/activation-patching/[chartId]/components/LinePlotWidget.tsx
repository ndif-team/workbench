"use client";

import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";

interface LinePlotData {
    lines: number[][];  // Each line is [value_layer_0, value_layer_1, ...]
    labels?: string[];  // Optional labels for each line
}

interface LinePlotWidgetProps {
    data: LinePlotData;
    title?: string;
    yAxisLabel?: string;
    xAxisLabel?: string;
    transparentBackground?: boolean;
}

interface TooltipState {
    visible: boolean;
    x: number;
    y: number;
    lineIdx: number;
    layerIdx: number;
    value: number;
    label: string;
    color: string;
}

// Refined color palette - more professional, slightly desaturated
const LINE_COLORS = [
    "#6366f1",  // indigo
    "#f43f5e",  // rose
    "#10b981",  // emerald
    "#f59e0b",  // amber
    "#8b5cf6",  // violet
    "#ec4899",  // pink
    "#06b6d4",  // cyan
    "#84cc16",  // lime
];

export function LinePlotWidget({
    data,
    title,
    yAxisLabel = "Probability",
    xAxisLabel = "Layer",
    transparentBackground = false,
}: LinePlotWidgetProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { resolvedTheme } = useTheme();
    const isDarkMode = resolvedTheme === "dark";
    
    // Track which lines are visible (all visible by default)
    const [hiddenLines, setHiddenLines] = useState<Set<number>>(new Set());
    
    // Tooltip state
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);
    
    // Resize counter to force redraw on container size change
    const [resizeCounter, setResizeCounter] = useState(0);
    
    // Store chart geometry for mouse calculations
    const chartGeometryRef = useRef<{
        margin: { top: number; right: number; bottom: number; left: number };
        chartWidth: number;
        chartHeight: number;
        width: number;
        height: number;
    } | null>(null);

    // Toggle line visibility
    const toggleLine = useCallback((lineIdx: number) => {
        setHiddenLines(prev => {
            const next = new Set(prev);
            if (next.has(lineIdx)) {
                next.delete(lineIdx);
            } else {
                next.add(lineIdx);
            }
            return next;
        });
    }, []);

    // Get labels for legend
    const labels = useMemo(() => {
        return data.labels || data.lines.map((_, i) => `Line ${i + 1}`);
    }, [data.labels, data.lines]);

    // Compute chart dimensions and data bounds
    const chartConfig = useMemo(() => {
        if (!data.lines || data.lines.length === 0) {
            return null;
        }

        const numLayers = data.lines[0]?.length || 0;

        // Fixed y-axis range from 0 to 1
        return {
            numLayers,
            minValue: 0,
            maxValue: 1,
            numLines: data.lines.length,
        };
    }, [data]);

    // Handle mouse move for tooltip
    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!chartConfig || !chartGeometryRef.current) return;
        
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const { margin, chartWidth, chartHeight } = chartGeometryRef.current;
        
        // Check if mouse is within chart area
        if (
            mouseX < margin.left || 
            mouseX > margin.left + chartWidth ||
            mouseY < margin.top || 
            mouseY > margin.top + chartHeight
        ) {
            setTooltip(null);
            return;
        }
        
        // Find nearest data point
        let nearestPoint: TooltipState | null = null;
        let minDistance = Infinity;
        const maxDistance = 20; // Max distance in pixels to show tooltip
        
        data.lines.forEach((line, lineIdx) => {
            if (hiddenLines.has(lineIdx)) return;
            
            line.forEach((value, layerIdx) => {
                // Calculate point position
                const x = chartConfig.numLayers <= 1 
                    ? margin.left + chartWidth / 2
                    : margin.left + (layerIdx / (chartConfig.numLayers - 1)) * chartWidth;
                const normalized = (value - chartConfig.minValue) / (chartConfig.maxValue - chartConfig.minValue);
                const y = margin.top + chartHeight - normalized * chartHeight;
                
                // Calculate distance
                const distance = Math.sqrt(Math.pow(mouseX - x, 2) + Math.pow(mouseY - y, 2));
                
                if (distance < minDistance && distance < maxDistance) {
                    minDistance = distance;
                    nearestPoint = {
                        visible: true,
                        x,
                        y,
                        lineIdx,
                        layerIdx,
                        value,
                        label: labels[lineIdx] || `Line ${lineIdx + 1}`,
                        color: LINE_COLORS[lineIdx % LINE_COLORS.length],
                    };
                }
            });
        });
        
        setTooltip(nearestPoint);
    }, [chartConfig, data.lines, hiddenLines, labels]);

    // Handle mouse leave
    const handleMouseLeave = useCallback(() => {
        setTooltip(null);
    }, []);

    // Draw the chart
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || !chartConfig) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Set canvas size based on container
        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
        ctx.scale(dpr, dpr);

        const width = rect.width;
        const height = rect.height;

        // Professional margins with breathing room
        const margin = { top: title ? 48 : 24, right: 24, bottom: 56, left: 64 };
        const chartWidth = width - margin.left - margin.right;
        const chartHeight = height - margin.top - margin.bottom;
        
        // Store geometry for mouse calculations
        chartGeometryRef.current = { margin, chartWidth, chartHeight, width, height };

        // Refined color palette based on theme
        const colors = {
            background: isDarkMode ? "#0a0a0a" : "#fafafa",
            text: isDarkMode ? "#71717a" : "#71717a",
            textMuted: isDarkMode ? "#52525b" : "#a1a1aa",
            grid: isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
            axis: isDarkMode ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)",
            titleText: isDarkMode ? "#e4e4e7" : "#27272a",
        };

        // Clear canvas
        if (transparentBackground) {
            ctx.clearRect(0, 0, width, height);
        } else {
            ctx.fillStyle = colors.background;
            ctx.fillRect(0, 0, width, height);
        }

        // Draw title (if provided)
        if (title) {
            ctx.fillStyle = colors.titleText;
            ctx.font = "500 14px 'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
            ctx.textAlign = "left";
            ctx.fillText(title, margin.left, 28);
        }

        // Transform functions
        const xScale = (layerIdx: number) => {
            if (chartConfig.numLayers <= 1) return margin.left + chartWidth / 2;
            return margin.left + (layerIdx / (chartConfig.numLayers - 1)) * chartWidth;
        };

        const yScale = (value: number) => {
            const normalized = (value - chartConfig.minValue) / (chartConfig.maxValue - chartConfig.minValue);
            return margin.top + chartHeight - normalized * chartHeight;
        };

        // Draw subtle horizontal grid lines with dashed pattern
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = colors.grid;
        ctx.lineWidth = 1;

        const yTicks = [0, 0.25, 0.5, 0.75, 1.0];
        yTicks.forEach(tick => {
            const y = yScale(tick);
            ctx.beginPath();
            ctx.moveTo(margin.left, y);
            ctx.lineTo(margin.left + chartWidth, y);
            ctx.stroke();
        });

        // Reset line dash
        ctx.setLineDash([]);

        // Draw Y-axis labels
        ctx.fillStyle = colors.text;
        ctx.font = "400 11px 'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";

        yTicks.forEach(tick => {
            const y = yScale(tick);
            ctx.fillText(tick.toFixed(2), margin.left - 12, y);
        });

        // Draw X-axis labels
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        
        const layerStep = Math.max(1, Math.ceil(chartConfig.numLayers / 8));
        for (let i = 0; i < chartConfig.numLayers; i += layerStep) {
            const x = xScale(i);
            ctx.fillText(i.toString(), x, margin.top + chartHeight + 12);
        }
        // Always show last layer
        if ((chartConfig.numLayers - 1) % layerStep !== 0) {
            const x = xScale(chartConfig.numLayers - 1);
            ctx.fillText((chartConfig.numLayers - 1).toString(), x, margin.top + chartHeight + 12);
        }

        // Draw minimal axes (just the L-shape border)
        ctx.strokeStyle = isDarkMode ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.25)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(margin.left, margin.top);
        ctx.lineTo(margin.left, margin.top + chartHeight);
        ctx.lineTo(margin.left + chartWidth, margin.top + chartHeight);
        ctx.stroke();

        // Draw axis labels
        ctx.fillStyle = colors.textMuted;
        ctx.font = "500 10px 'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
        
        // X-axis label
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(xAxisLabel.toUpperCase(), margin.left + chartWidth / 2, height - 16);

        // Y-axis label (rotated)
        ctx.save();
        ctx.translate(16, margin.top + chartHeight / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(yAxisLabel.toUpperCase(), 0, 0);
        ctx.restore();

        // Faded color for hidden lines
        const fadedColor = isDarkMode ? "#3f3f46" : "#d4d4d8";
        
        // Draw lines with smooth rendering
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        // First pass: draw faded/hidden lines
        data.lines.forEach((line, lineIdx) => {
            if (!hiddenLines.has(lineIdx)) return;

            ctx.beginPath();
            ctx.strokeStyle = fadedColor;
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.35;

            line.forEach((value, layerIdx) => {
                const x = xScale(layerIdx);
                const y = yScale(value);
                if (layerIdx === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            ctx.stroke();
            ctx.globalAlpha = 1;
        });

        // Second pass: draw active lines on top
        data.lines.forEach((line, lineIdx) => {
            if (hiddenLines.has(lineIdx)) return;
            
            const color = LINE_COLORS[lineIdx % LINE_COLORS.length];

            // Draw line shadow for depth
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 4;
            ctx.globalAlpha = 0.15;
            line.forEach((value, layerIdx) => {
                const x = xScale(layerIdx);
                const y = yScale(value);
                if (layerIdx === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            ctx.stroke();
            ctx.globalAlpha = 1;

            // Draw the main line
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;

            line.forEach((value, layerIdx) => {
                const x = xScale(layerIdx);
                const y = yScale(value);
                if (layerIdx === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            ctx.stroke();

            // Draw refined data points (smaller, with subtle ring)
            line.forEach((value, layerIdx) => {
                const x = xScale(layerIdx);
                const y = yScale(value);
                
                // Check if this is the hovered point
                const isHovered = tooltip?.lineIdx === lineIdx && tooltip?.layerIdx === layerIdx;
                
                // Outer ring (larger when hovered)
                ctx.beginPath();
                ctx.strokeStyle = color;
                ctx.lineWidth = isHovered ? 2 : 1.5;
                ctx.arc(x, y, isHovered ? 5 : 3.5, 0, Math.PI * 2);
                ctx.stroke();
                
                // Inner fill
                ctx.beginPath();
                ctx.fillStyle = isDarkMode ? "#18181b" : "#ffffff";
                ctx.arc(x, y, isHovered ? 3.5 : 2.5, 0, Math.PI * 2);
                ctx.fill();
            });
        });
    }, [data, chartConfig, isDarkMode, title, xAxisLabel, yAxisLabel, transparentBackground, hiddenLines, tooltip, resizeCounter]);

    // Handle resize - increment counter to trigger redraw
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const observer = new ResizeObserver(() => {
            // Increment counter to trigger the drawing effect
            setResizeCounter(c => c + 1);
        });

        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    if (!chartConfig) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                No data to display
            </div>
        );
    }

    return (
        <div ref={containerRef} className="relative w-full h-full min-h-[300px]">
            <canvas 
                ref={canvasRef} 
                className="w-full h-full cursor-crosshair" 
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
            />
            
            {/* Tooltip */}
            {tooltip && (
                <div
                    className="absolute pointer-events-none z-50 animate-in fade-in-0 zoom-in-95 duration-100"
                    style={{
                        left: tooltip.x,
                        top: tooltip.y,
                        transform: `translate(${tooltip.x > (chartGeometryRef.current?.width || 0) / 2 ? 'calc(-100% - 12px)' : '12px'}, -50%)`,
                    }}
                >
                    <div className="bg-popover/95 backdrop-blur-sm border border-border rounded-lg shadow-lg px-3 py-2 min-w-[120px]">
                        {/* Label with color indicator */}
                        <div className="flex items-center gap-2 mb-1.5">
                            <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: tooltip.color }}
                            />
                            <span className="text-xs font-medium text-foreground truncate max-w-[100px]">
                                {tooltip.label}
                            </span>
                        </div>
                        
                        {/* Values */}
                        <div className="space-y-0.5 text-[11px]">
                            <div className="flex justify-between gap-4">
                                <span className="text-muted-foreground">Layer</span>
                                <span className="font-medium text-foreground">{tooltip.layerIdx}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="text-muted-foreground">Value</span>
                                <span className="font-medium text-foreground">{tooltip.value.toFixed(4)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Refined Interactive Legend */}
            <div className="absolute top-2 right-3 flex flex-col gap-0.5 py-1.5 px-1 rounded-md bg-background/70 backdrop-blur-md border border-border/40">
                {labels.map((label, idx) => {
                    const color = LINE_COLORS[idx % LINE_COLORS.length];
                    const isHidden = hiddenLines.has(idx);
                    
                    return (
                        <button
                            key={idx}
                            onClick={() => toggleLine(idx)}
                            className={cn(
                                "group flex items-center gap-2 pl-2 pr-2 py-1 rounded transition-all duration-150",
                                "hover:bg-accent/40",
                                isHidden ? "opacity-50" : "opacity-100"
                            )}
                        >
                            {/* Color indicator with ring style matching data points */}
                            <span className="relative flex-shrink-0">
                                <span
                                    className={cn(
                                        "block w-2.5 h-2.5 rounded-full border-[1.5px] transition-all duration-150",
                                        isHidden ? "bg-muted border-muted-foreground/30" : "bg-background"
                                    )}
                                    style={{ 
                                        borderColor: isHidden ? undefined : color,
                                    }}
                                />
                            </span>
                            
                            {/* Label */}
                            <span 
                                className={cn(
                                    "text-[11px] font-medium truncate max-w-[72px] transition-colors duration-150",
                                    isHidden ? "text-muted-foreground/60" : "text-foreground/80"
                                )}
                                title={label}
                            >
                                {label}
                            </span>
                            
                            {/* Visibility indicator */}
                            <span className={cn(
                                "ml-auto transition-opacity duration-150",
                                isHidden ? "opacity-60" : "opacity-0 group-hover:opacity-40"
                            )}>
                                {isHidden ? (
                                    <EyeOff className="w-3 h-3 text-muted-foreground" />
                                ) : (
                                    <Eye className="w-3 h-3 text-muted-foreground" />
                                )}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
