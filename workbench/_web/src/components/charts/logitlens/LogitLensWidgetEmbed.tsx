"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

// Tracked trajectory with optional rank data
export interface TrackedTrajectory {
    prob: number[];
    rank?: number[];
}

// Type for widget data in V2 format
export interface LogitLensV2Data {
    meta: { version: number; model: string };
    input: string[];
    layers: number[];
    topk: string[][][]; // [layer][position][k]
    tracked: Record<string, number[] | TrackedTrajectory>[]; // [position]{token: trajectory or {prob, rank}}
    entropy?: number[][]; // [layer][position] - entropy values
}

// Pinned group type
export interface PinnedGroup {
    tokens: string[];
    color: string;
}

// Serialized pinned row type
export interface SerializedPinnedRow {
    pos: number;
    line: string;
}

// Type for the widget interface returned by LogitLensWidget
export interface LogitLensWidgetInterface {
    uid: string;
    getState: () => Record<string, unknown>;
    getColumnState: () => Record<string, unknown>;
    setColumnState: (state: Record<string, unknown>) => void;
    linkColumnsTo: (widget: LogitLensWidgetInterface) => void;
    unlinkColumns: (widget: LogitLensWidgetInterface) => void;
    setDarkMode: (enabled: boolean | null) => void;
    getDarkMode: () => boolean;
    // Row and group manipulation
    togglePinnedRow: (pos: number) => boolean;
    togglePinnedTrajectory: (token: string, addToGroup?: boolean) => boolean;
    getPinnedRows: () => SerializedPinnedRow[];
    getPinnedGroups: () => PinnedGroup[];
    // Event system
    on: <K extends string>(event: K, listener: (value: unknown) => void) => void;
    off: <K extends string>(event: K, listener: (value: unknown) => void) => void;
    // Title management
    setTitle: (title: string) => void;
    getTitle: () => string;
    // Visibility toggles
    setShowHeatmap: (show: boolean) => void;
    getShowHeatmap: () => boolean;
    setShowChart: (show: boolean) => void;
    getShowChart: () => boolean;
    // Metric mode
    setTrajectoryMetric: (metric: "prob" | "rank") => void;
    getTrajectoryMetric: () => "prob" | "rank";
    hasRankData: () => boolean;
    // Hover API for external synchronization
    hoverRow: (pos: number) => void;
    clearHover: () => void;
    getHoveredRow: () => number;
}

// Declare the global LogitLensWidget function
declare global {
    interface Window {
        LogitLensWidget?: (
            container: string | HTMLElement,
            data: LogitLensV2Data,
            uiState?: Record<string, unknown>
        ) => LogitLensWidgetInterface;
    }
}

interface LogitLensWidgetEmbedProps {
    data: LogitLensV2Data | null;
    title?: string;
    className?: string;
    pending?: boolean;
    /** Maximum number of rows to display in heatmap (for viewport fitting) */
    maxRows?: number | null;
    onWidgetReady?: (widget: LogitLensWidgetInterface) => void;
    /** Called when pinned rows change in the widget */
    onRowPinChange?: (pinnedRows: SerializedPinnedRow[]) => void;
    /** Called when pinned token groups change in the widget */
    onGroupPinChange?: (pinnedGroups: PinnedGroup[]) => void;
    /** Called when the title is changed by the user */
    onTitleChange?: (title: string) => void;
    /** Called when a row is hovered in the widget (pos is null when hover ends) */
    onRowHover?: (pos: number | null) => void;
    /** External ref to access the widget instance */
    widgetRef?: React.MutableRefObject<LogitLensWidgetInterface | null>;
}

export function LogitLensWidgetEmbed({
    data,
    title,
    className,
    pending = false,
    maxRows,
    onWidgetReady,
    onRowPinChange,
    onGroupPinChange,
    onTitleChange,
    onRowHover,
    widgetRef: externalWidgetRef,
}: LogitLensWidgetEmbedProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const internalWidgetRef = useRef<LogitLensWidgetInterface | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Use external ref if provided, otherwise internal
    const widgetRef = externalWidgetRef || internalWidgetRef;

    // Load the widget script
    const loadWidgetScript = useCallback((): Promise<void> => {
        return new Promise((resolve, reject) => {
            // Check if already loaded
            if (window.LogitLensWidget) {
                resolve();
                return;
            }

            // Check if script is already being loaded
            const existingScript = document.querySelector(
                'script[src="/logit-lens-widget.js"]'
            );
            if (existingScript) {
                existingScript.addEventListener("load", () => resolve());
                existingScript.addEventListener("error", () =>
                    reject(new Error("Failed to load widget script"))
                );
                return;
            }

            // Load the script
            const script = document.createElement("script");
            script.src = "/logit-lens-widget.js";
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Failed to load widget script"));
            document.head.appendChild(script);
        });
    }, []);

    // Initialize or update widget
    useEffect(() => {
        if (!data || !containerRef.current || pending) {
            return;
        }

        let mounted = true;

        const initWidget = async () => {
            try {
                setIsLoading(true);
                setError(null);

                await loadWidgetScript();

                if (!mounted || !containerRef.current || !window.LogitLensWidget) {
                    return;
                }

                // Clear container
                containerRef.current.innerHTML = "";

                // Build UI state
                const uiState: Record<string, unknown> = {};
                if (title) {
                    uiState.title = title;
                }
                if (maxRows !== undefined) {
                    uiState.maxRows = maxRows;
                }

                // Create widget
                const widget = window.LogitLensWidget(
                    containerRef.current,
                    data,
                    uiState
                );

                widgetRef.current = widget;

                // Set up event listeners
                if (onRowPinChange) {
                    widget.on('pinnedRows', onRowPinChange as (value: unknown) => void);
                }
                if (onGroupPinChange) {
                    widget.on('pinnedGroups', onGroupPinChange as (value: unknown) => void);
                }
                if (onTitleChange) {
                    widget.on('title', onTitleChange as (value: unknown) => void);
                }
                if (onRowHover) {
                    widget.on('hover', onRowHover as (value: unknown) => void);
                }

                // Detect dark mode from CSS
                const isDark = document.documentElement.classList.contains("dark");
                widget.setDarkMode(isDark);

                if (onWidgetReady) {
                    onWidgetReady(widget);
                }

                setIsLoading(false);
            } catch (err) {
                if (mounted) {
                    setError(err instanceof Error ? err.message : "Failed to load widget");
                    setIsLoading(false);
                }
            }
        };

        initWidget();

        return () => {
            mounted = false;
        };
    }, [data, pending, loadWidgetScript, onWidgetReady, widgetRef]);

    // Update title when prop changes (without re-creating widget)
    useEffect(() => {
        if (widgetRef.current && title !== undefined) {
            const currentTitle = widgetRef.current.getTitle();
            if (currentTitle !== title) {
                widgetRef.current.setTitle(title);
            }
        }
    }, [title, widgetRef]);

    // Store refs for current listeners to enable cleanup
    const listenersRef = useRef<{
        pinnedRows?: (value: unknown) => void;
        pinnedGroups?: (value: unknown) => void;
        title?: (value: unknown) => void;
        hover?: (value: unknown) => void;
    }>({});

    // Update event listeners when they change (without re-creating widget)
    useEffect(() => {
        if (widgetRef.current) {
            const widget = widgetRef.current;
            const prev = listenersRef.current;

            // Remove old listeners
            if (prev.pinnedRows) widget.off('pinnedRows', prev.pinnedRows);
            if (prev.pinnedGroups) widget.off('pinnedGroups', prev.pinnedGroups);
            if (prev.title) widget.off('title', prev.title);
            if (prev.hover) widget.off('hover', prev.hover);

            // Add new listeners and store refs
            const newListeners: typeof prev = {};
            if (onRowPinChange) {
                newListeners.pinnedRows = onRowPinChange as (value: unknown) => void;
                widget.on('pinnedRows', newListeners.pinnedRows);
            }
            if (onGroupPinChange) {
                newListeners.pinnedGroups = onGroupPinChange as (value: unknown) => void;
                widget.on('pinnedGroups', newListeners.pinnedGroups);
            }
            if (onTitleChange) {
                newListeners.title = onTitleChange as (value: unknown) => void;
                widget.on('title', newListeners.title);
            }
            if (onRowHover) {
                newListeners.hover = onRowHover as (value: unknown) => void;
                widget.on('hover', newListeners.hover);
            }

            listenersRef.current = newListeners;
        }
    }, [onRowPinChange, onGroupPinChange, onTitleChange, onRowHover, widgetRef]);

    // Update dark mode when theme changes
    useEffect(() => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (
                    mutation.type === "attributes" &&
                    mutation.attributeName === "class" &&
                    widgetRef.current
                ) {
                    const isDark = document.documentElement.classList.contains("dark");
                    widgetRef.current.setDarkMode(isDark);
                }
            });
        });

        observer.observe(document.documentElement, { attributes: true });

        return () => observer.disconnect();
    }, []);

    if (error) {
        return (
            <div
                className={cn(
                    "flex items-center justify-center p-4 text-destructive",
                    className
                )}
            >
                {error}
            </div>
        );
    }

    return (
        <div className={cn("relative w-full", className)}>
            {(isLoading || pending) && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            )}
            <div
                ref={containerRef}
                className={cn(
                    "w-full min-h-[300px] bg-background rounded-lg",
                    (isLoading || pending) && "opacity-0"
                )}
            />
        </div>
    );
}
