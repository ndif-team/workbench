"use client";

import { useEffect, useRef, useMemo } from "react";
import { useTheme } from "next-themes";

interface LinePlotData {
    lines: number[][];  // Each line is [value_layer_0, value_layer_1, ...]
    labels?: string[];  // Optional labels for each line
}

interface LinePlotWidgetProps {
    data: LinePlotData;
    title?: string;
    yAxisLabel?: string;
    xAxisLabel?: string;
}

// Color palette for lines
const LINE_COLORS = [
    "#3b82f6",  // blue
    "#ef4444",  // red
    "#22c55e",  // green
    "#f59e0b",  // amber
    "#8b5cf6",  // violet
    "#ec4899",  // pink
    "#06b6d4",  // cyan
    "#84cc16",  // lime
];

export function LinePlotWidget({
    data,
    title = "Activation Patching Results",
    yAxisLabel = "Probability",
    xAxisLabel = "Layer",
}: LinePlotWidgetProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { resolvedTheme } = useTheme();
    const isDarkMode = resolvedTheme === "dark";

    // Compute chart dimensions and data bounds
    const chartConfig = useMemo(() => {
        if (!data.lines || data.lines.length === 0) {
            return null;
        }

        const numLayers = data.lines[0]?.length || 0;
        const allValues = data.lines.flat();
        const minValue = Math.min(...allValues, 0);
        const maxValue = Math.max(...allValues, 0.1);  // At least 0.1 to avoid empty chart

        // Add some padding to the range
        const range = maxValue - minValue;
        const paddedMax = maxValue + range * 0.1;
        const paddedMin = Math.max(0, minValue - range * 0.05);

        return {
            numLayers,
            minValue: paddedMin,
            maxValue: paddedMax,
            numLines: data.lines.length,
        };
    }, [data]);

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

        // Chart margins
        const margin = { top: 40, right: 120, bottom: 50, left: 60 };
        const chartWidth = width - margin.left - margin.right;
        const chartHeight = height - margin.top - margin.bottom;

        // Colors based on theme
        const bgColor = isDarkMode ? "#1e1e1e" : "#fafafa";
        const textColor = isDarkMode ? "#a0a0a0" : "#666666";
        const gridColor = isDarkMode ? "#333333" : "#e5e5e5";
        const axisColor = isDarkMode ? "#555555" : "#cccccc";

        // Clear canvas
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, width, height);

        // Draw title
        ctx.fillStyle = isDarkMode ? "#e0e0e0" : "#333333";
        ctx.font = "600 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(title, width / 2, 24);

        // Transform functions
        const xScale = (layerIdx: number) => {
            return margin.left + (layerIdx / (chartConfig.numLayers - 1)) * chartWidth;
        };

        const yScale = (value: number) => {
            const normalized = (value - chartConfig.minValue) / (chartConfig.maxValue - chartConfig.minValue);
            return margin.top + chartHeight - normalized * chartHeight;
        };

        // Draw grid lines
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;

        // Horizontal grid lines (5 lines)
        for (let i = 0; i <= 4; i++) {
            const y = margin.top + (i / 4) * chartHeight;
            ctx.beginPath();
            ctx.moveTo(margin.left, y);
            ctx.lineTo(margin.left + chartWidth, y);
            ctx.stroke();

            // Y-axis labels
            const value = chartConfig.maxValue - (i / 4) * (chartConfig.maxValue - chartConfig.minValue);
            ctx.fillStyle = textColor;
            ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
            ctx.textAlign = "right";
            ctx.fillText(value.toFixed(2), margin.left - 10, y + 4);
        }

        // Vertical grid lines (every ~10 layers or so)
        const layerStep = Math.max(1, Math.floor(chartConfig.numLayers / 10));
        for (let i = 0; i < chartConfig.numLayers; i += layerStep) {
            const x = xScale(i);
            ctx.beginPath();
            ctx.strokeStyle = gridColor;
            ctx.moveTo(x, margin.top);
            ctx.lineTo(x, margin.top + chartHeight);
            ctx.stroke();

            // X-axis labels
            ctx.fillStyle = textColor;
            ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(i.toString(), x, margin.top + chartHeight + 20);
        }

        // Draw axes
        ctx.strokeStyle = axisColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(margin.left, margin.top);
        ctx.lineTo(margin.left, margin.top + chartHeight);
        ctx.lineTo(margin.left + chartWidth, margin.top + chartHeight);
        ctx.stroke();

        // Axis labels
        ctx.fillStyle = textColor;
        ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(xAxisLabel, margin.left + chartWidth / 2, height - 10);

        // Y-axis label (rotated)
        ctx.save();
        ctx.translate(15, margin.top + chartHeight / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(yAxisLabel, 0, 0);
        ctx.restore();

        // Draw lines
        data.lines.forEach((line, lineIdx) => {
            const color = LINE_COLORS[lineIdx % LINE_COLORS.length];

            // Draw the line path
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.5;
            ctx.lineJoin = "round";
            ctx.lineCap = "round";

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

            // Draw dots at each point
            line.forEach((value, layerIdx) => {
                const x = xScale(layerIdx);
                const y = yScale(value);
                ctx.beginPath();
                ctx.fillStyle = color;
                ctx.arc(x, y, 3, 0, Math.PI * 2);
                ctx.fill();
            });
        });

        // Draw legend
        const legendX = margin.left + chartWidth + 15;
        const legendY = margin.top + 10;
        const legendItemHeight = 24;

        const labels = data.labels || data.lines.map((_, i) => `Line ${i + 1}`);

        labels.forEach((label, idx) => {
            const y = legendY + idx * legendItemHeight;
            const color = LINE_COLORS[idx % LINE_COLORS.length];

            // Color box
            ctx.fillStyle = color;
            ctx.fillRect(legendX, y - 6, 16, 12);

            // Label text
            ctx.fillStyle = textColor;
            ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
            ctx.textAlign = "left";
            ctx.fillText(label, legendX + 22, y + 4);
        });
    }, [data, chartConfig, isDarkMode, title, xAxisLabel, yAxisLabel]);

    // Handle resize
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const observer = new ResizeObserver(() => {
            // Trigger re-render by updating a dummy state or just let the effect re-run
            const canvas = canvasRef.current;
            if (canvas) {
                canvas.style.width = "0";  // Force reflow
                canvas.style.width = "";
            }
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
        <div ref={containerRef} className="w-full h-full min-h-[300px]">
            <canvas ref={canvasRef} className="w-full h-full" />
        </div>
    );
}
