"use client";

import { useEffect, useRef, useCallback, useState } from "react";

/**
 * LogitLensKit V2 Data Format
 * 
 * This is the data format expected by the LogitLensWidget visualization.
 * It differs from the V1 format by storing trajectories only once per token
 * (in `tracked`) rather than duplicating them at each layer.
 */
export interface LogitLensData {
    meta: {
        version: number;
        timestamp: string;
        model: string;
    };
    layers: number[];
    input: string[];
    tracked: Record<string, number[]>[];  // Per-position: token -> trajectory
    topk: string[][][];  // [layer][position] -> list of top-k tokens
    entropy?: number[][];  // Optional: [layer][position] -> entropy value
}

/**
 * UI State that can be serialized and restored
 */
export interface LogitLensUIState {
    chartHeight?: number | null;
    inputTokenWidth?: number;
    cellWidth?: number;
    maxRows?: number | null;
    maxTableWidth?: number | null;
    plotMinLayer?: number;
    colorModes?: string[];
    title?: string;
    colorIndex?: number;
    pinnedGroups?: Array<{
        tokens: string[];
        color: string;
        lineStyle?: { name: string; dash: string };
    }>;
    lastPinnedGroupIndex?: number;
    pinnedRows?: Array<{ pos: number; line: string }>;
    heatmapBaseColor?: string | null;
    heatmapNextColor?: string | null;
    darkMode?: boolean | null;
    showHeatmap?: boolean;
    showChart?: boolean;
    trajectoryMetric?: "probability" | "rank";
}

interface LogitLensWidgetProps {
    data: LogitLensData | null;
    uiState?: LogitLensUIState;
    onStateChange?: (state: LogitLensUIState) => void;
    darkMode?: boolean;
    className?: string;
    titleSize?: string;
    contentSize?: string;
}

// Declare the global LogitLensWidget function type
declare global {
    interface Window {
        LogitLensWidget: (
            container: HTMLElement | string,
            data: LogitLensData,
            uiState?: LogitLensUIState
        ) => LogitLensWidgetInterface;
    }
}

interface LogitLensWidgetInterface {
    getState: () => LogitLensUIState;
    setState: (state: Partial<LogitLensUIState>) => void;
    setData: (data: LogitLensData) => void;
    setTitle: (title: string) => void;
    setDarkMode: (dark: boolean) => void;
    getDarkMode: () => boolean;
    hasEntropyData: () => boolean;
    linkColumnsTo: (other: LogitLensWidgetInterface) => void;
    unlinkColumns: (other: LogitLensWidgetInterface) => void;
    on: (event: string, callback: (data: unknown) => void) => void;
    off: (event: string, callback: (data: unknown) => void) => void;
    destroy: () => void;
}

/**
 * React wrapper for the LogitLensWidget visualization.
 * 
 * This component loads the vanilla JS LogitLensWidget and provides a React-friendly
 * interface with proper lifecycle management.
 */
export function LogitLensWidget({
    data,
    uiState,
    onStateChange,
    darkMode,
    className,
    titleSize = "16px",
    contentSize = "12px",
}: LogitLensWidgetProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetRef = useRef<LogitLensWidgetInterface | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Load the widget script
    useEffect(() => {
        // Check if already loaded
        if (window.LogitLensWidget) {
            setIsLoaded(true);
            return;
        }

        // Load the script
        const script = document.createElement("script");
        script.src = "/interp-tools/logit-lens-widget.js";
        script.async = true;
        script.onload = () => {
            setIsLoaded(true);
        };
        script.onerror = () => {
            setError("Failed to load LogitLensWidget script");
        };
        document.head.appendChild(script);

        return () => {
            // Don't remove script on unmount - it's cached
        };
    }, []);

    // Initialize or update the widget
    useEffect(() => {
        if (!isLoaded || !containerRef.current || !data) {
            return;
        }

        // Clean up existing widget
        if (widgetRef.current) {
            widgetRef.current.destroy();
            widgetRef.current = null;
        }

        // Clear container
        containerRef.current.innerHTML = "";

        try {
            // Create new widget
            const mergedState: LogitLensUIState = {
                ...uiState,
                darkMode: darkMode ?? uiState?.darkMode ?? null,
            };

            widgetRef.current = window.LogitLensWidget(
                containerRef.current,
                data,
                mergedState
            );
        } catch (e) {
            console.error("Failed to create LogitLensWidget:", e);
            setError(e instanceof Error ? e.message : "Failed to create widget");
        }
    }, [isLoaded, data, uiState, darkMode]);

    // Update dark mode when it changes
    useEffect(() => {
        if (widgetRef.current && darkMode !== undefined) {
            widgetRef.current.setDarkMode(darkMode);
        }
    }, [darkMode]);

    // Set up CSS custom properties for font sizes
    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.style.setProperty("--ll-title-size", titleSize);
            containerRef.current.style.setProperty("--ll-content-size", contentSize);
        }
    }, [titleSize, contentSize]);

    // Handle state changes
    const handleStateChange = useCallback(() => {
        if (widgetRef.current && onStateChange) {
            const state = widgetRef.current.getState();
            onStateChange(state);
        }
    }, [onStateChange]);

    // Set up event listener for state changes
    useEffect(() => {
        if (!widgetRef.current || !onStateChange) {
            return;
        }

        const widget = widgetRef.current;
        widget.on("stateChange", handleStateChange);

        return () => {
            widget.off("stateChange", handleStateChange);
        };
    }, [isLoaded, onStateChange, handleStateChange]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (widgetRef.current) {
                widgetRef.current.destroy();
                widgetRef.current = null;
            }
        };
    }, []);

    if (error) {
        return (
            <div className={`flex items-center justify-center p-4 text-destructive ${className}`}>
                <span>{error}</span>
            </div>
        );
    }

    if (!isLoaded) {
        return (
            <div className={`flex items-center justify-center p-4 ${className}`}>
                <span className="text-muted-foreground">Loading visualization...</span>
            </div>
        );
    }

    if (!data) {
        return (
            <div className={`flex items-center justify-center p-4 ${className}`}>
                <span className="text-muted-foreground">No data available</span>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className={className}
            style={{
                // @ts-expect-error CSS custom properties
                "--ll-title-size": titleSize,
                "--ll-content-size": contentSize,
            }}
        />
    );
}
