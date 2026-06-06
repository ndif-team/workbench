"use client";

import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ModelsFetchErrorBannerProps {
    onRetry: () => void;
    isRetrying?: boolean;
}

/**
 * Red-error banner that replaces the carousel area when the model catalog
 * fails to load from NDIF. Communicates "models could not be fetched / backend
 * unavailable" with a Retry control.
 */
export function ModelsFetchErrorBanner({
    onRetry,
    isRetrying = false,
}: ModelsFetchErrorBannerProps) {
    return (
        <div
            role="alert"
            aria-live="polite"
            className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-3.5 p-4 rounded-md border border-red-500/45 bg-red-50/70 dark:bg-red-500/10"
        >
            <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-red-500/45 bg-red-100/70 dark:bg-red-500/15 text-red-700 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
            </span>

            <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                    Models could not be fetched
                </span>
                <span className="inline-flex items-center h-5 px-1.5 rounded border border-red-500/45 text-xs font-medium text-red-700 dark:text-red-400 bg-red-100/60 dark:bg-red-500/15">
                    backend unavailable
                </span>
            </div>

            <div className="flex gap-1.5 flex-shrink-0">
                <Button
                    type="button"
                    size="sm"
                    onClick={onRetry}
                    disabled={isRetrying}
                    className="h-7 px-2.5 text-xs gap-1.5 bg-red-600 hover:bg-red-700 text-white"
                >
                    <RefreshCcw className={isRetrying ? "h-3 w-3 animate-spin" : "h-3 w-3"} />
                    Retry
                </Button>
            </div>
        </div>
    );
}
