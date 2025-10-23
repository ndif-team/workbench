"use client";

import React, { createContext, useContext, type ReactNode, useRef, useCallback } from "react";
import { toBlob } from "html-to-image";
import { toast } from "sonner";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { uploadThumbnailPublic } from "@/lib/supabase/client";

interface CaptureContextValue {
    captureRef: React.RefObject<HTMLDivElement>;
    handleCopyPng: () => Promise<void>;
    captureChartThumbnail: (chartId: string) => Promise<void>;
}

const CaptureContext = createContext<CaptureContextValue | null>(null);

export function useCapture(): CaptureContextValue {
    const ctx = useContext(CaptureContext);
    if (!ctx) throw new Error("useCapture must be used within a CaptureProvider");
    return ctx;
}

interface CaptureProviderProps {
    children: ReactNode;
}

export function CaptureProvider({ children }: CaptureProviderProps) {
    const captureRef = useRef<HTMLDivElement>(null);
    const params = useParams<{ workspaceId?: string; chartId?: string }>();
    const queryClient = useQueryClient();

    const handleCopyPng = useCallback(async () => {
        if (!captureRef.current) return;
        try {
            const blob = await toBlob(captureRef.current, {
                cacheBust: true,
                backgroundColor:
                    getComputedStyle(document.documentElement).getPropertyValue("--background") ||
                    "#ffffff",
                pixelRatio: 2,
            });
            if (!blob) return;
            type ClipboardItemCtor = new (items: Record<string, Blob>) => ClipboardItem;
            const ClipboardItemClass = (
                globalThis as unknown as { ClipboardItem?: ClipboardItemCtor }
            ).ClipboardItem;
            if (!ClipboardItemClass) {
                console.error("Clipboard image write is not supported in this browser.");
                return;
            }
            const item = new ClipboardItemClass({ "image/png": blob });
            await navigator.clipboard.write([item as unknown as ClipboardItem]);
            toast.success("Copied to clipboard");
        } catch (err) {
            console.error("Failed to copy PNG", err);
        }
    }, []);

    const captureChartThumbnail = useCallback(
        async (chartId: string) => {
            // Only capture if the currently displayed chart matches the requested id
            const currentChartId = params?.chartId as string | undefined;
            if (currentChartId && currentChartId !== chartId) return;
            const el = captureRef.current;
            if (!el) return;
            try {
                const blob = await toBlob(el, {
                    cacheBust: true,
                    backgroundColor:
                        getComputedStyle(document.documentElement).getPropertyValue(
                            "--background",
                        ) || "#ffffff",
                    pixelRatio: 1,
                    width: Math.min(el.clientWidth, 480),
                    height: Math.min(el.clientHeight, 480),
                });
                if (!blob) return;
                const workspaceId = params?.workspaceId as string;
                const path = `${workspaceId}/${chartId}.png`;
                await uploadThumbnailPublic(blob, path);
                // Invalidate sidebar images
                await queryClient.invalidateQueries({
                    queryKey: ["chartsForSidebar", workspaceId],
                });
            } catch (e) {
                console.error("Thumbnail upload failed", e);
            }
        },
        [params?.workspaceId, params?.chartId, queryClient],
    );

    const value: CaptureContextValue = {
        captureRef,
        handleCopyPng,
        captureChartThumbnail,
    };

    return <CaptureContext.Provider value={value}>{children}</CaptureContext.Provider>;
}
