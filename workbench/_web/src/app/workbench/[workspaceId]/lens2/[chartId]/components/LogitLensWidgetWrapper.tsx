"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Lens2Data, Lens2UIState } from "@/types/lens2";
import { Loader2 } from "lucide-react";

interface LogitLensWidgetInterface {
    getState: () => Lens2UIState;
    setState: (state: Partial<Lens2UIState>) => void;
    setData: (data: Lens2Data) => void;
    setTitle: (title: string) => void;
    setDarkMode: (dark: boolean) => void;
    getDarkMode: () => boolean;
    hasEntropyData: () => boolean;
    destroy: () => void;
}

declare global {
    interface Window {
        LogitLensWidget?: (
            container: HTMLElement | string,
            data: Lens2Data,
            uiState?: Partial<Lens2UIState>
        ) => LogitLensWidgetInterface;
    }
}

interface LogitLensWidgetWrapperProps {
    data: Lens2Data;
    darkMode?: boolean;
    titleSize?: string;
    contentSize?: string;
}

export function LogitLensWidgetWrapper({
    data,
    darkMode = false,
    titleSize = "16px",
    contentSize = "12px",
}: LogitLensWidgetWrapperProps) {
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
            // Small delay to ensure the script is fully executed
            setTimeout(() => {
                if (window.LogitLensWidget) {
                    setIsLoaded(true);
                } else {
                    setError("LogitLensWidget not found after script load");
                }
            }, 50);
        };
        script.onerror = () => {
            setError("Failed to load LogitLensWidget script");
        };
        document.head.appendChild(script);

        return () => {
            // Don't remove script on unmount - it's cached
        };
    }, []);

    // Create or update the widget
    const createWidget = useCallback(() => {
        if (!isLoaded || !containerRef.current || !data || !window.LogitLensWidget) {
            return;
        }

        // Clean up existing widget
        if (widgetRef.current) {
            try {
                widgetRef.current.destroy();
            } catch (e) {
                console.warn("Error destroying widget:", e);
            }
            widgetRef.current = null;
        }

        // Clear container
        containerRef.current.innerHTML = "";

        try {
            // Create new widget
            const uiState: Partial<Lens2UIState> = {
                darkMode: darkMode,
            };

            widgetRef.current = window.LogitLensWidget(
                containerRef.current,
                data,
                uiState
            );
        } catch (e) {
            console.error("Failed to create LogitLensWidget:", e);
            setError(e instanceof Error ? e.message : "Failed to create widget");
        }
    }, [isLoaded, data, darkMode]);

    // Create widget when ready
    useEffect(() => {
        createWidget();
    }, [createWidget]);

    // Update dark mode when it changes
    useEffect(() => {
        if (widgetRef.current) {
            try {
                widgetRef.current.setDarkMode(darkMode);
            } catch (e) {
                console.warn("Error setting dark mode:", e);
            }
        }
    }, [darkMode]);

    // Set up CSS custom properties for font sizes
    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.style.setProperty("--ll-title-size", titleSize);
            containerRef.current.style.setProperty("--ll-content-size", contentSize);
        }
    }, [titleSize, contentSize]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (widgetRef.current) {
                try {
                    widgetRef.current.destroy();
                } catch (e) {
                    console.warn("Error during cleanup:", e);
                }
                widgetRef.current = null;
            }
        };
    }, []);

    if (error) {
        return (
            <div className="flex items-center justify-center p-4 text-destructive">
                <span>Error: {error}</span>
            </div>
        );
    }

    if (!isLoaded) {
        return (
            <div className="flex items-center justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span className="text-muted-foreground">Loading visualization...</span>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="w-full min-h-[400px]"
            style={{
                // @ts-expect-error CSS custom properties
                "--ll-title-size": titleSize,
                "--ll-content-size": contentSize,
            }}
        />
    );
}
