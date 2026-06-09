"use client";

import { useEffect, useRef } from "react";
import { GenerationItem } from "./GenerationItem";
import type { GenerationItem as GenerationItemType, GenerationViewMode } from "@/types/generation";

interface GenerationTimelineProps {
    items: GenerationItemType[];
    viewMode: GenerationViewMode;
    onRemove: (id: string) => void;
    onRegenerate?: (item: GenerationItemType) => void;
    modelName?: string;
}

const NEAR_BOTTOM_PX = 120;

export function GenerationTimeline({
    items,
    viewMode,
    onRemove,
    onRegenerate,
    modelName,
}: GenerationTimelineProps) {
    const listRef = useRef<HTMLDivElement>(null);
    const lastSigRef = useRef<string | null>(null);
    const initializedRef = useRef(false);

    // Newest item lives at items[0] in the store; it's rendered at the BOTTOM.
    const newestId = items[0]?.id;
    const newestStatus = items[0]?.status;

    useEffect(() => {
        const el = listRef.current;
        if (!el || items.length === 0) return;

        const sig = `${newestId}:${newestStatus}`;

        // First items: jump straight to the bottom (newest), no animation.
        if (!initializedRef.current) {
            initializedRef.current = true;
            lastSigRef.current = sig;
            el.scrollTop = el.scrollHeight;
            return;
        }

        // A new generation, or the newest one settling (pending → done), should
        // follow to the bottom — but only if the user is already near it, so we
        // never yank them out of older generations they're reading.
        if (sig === lastSigRef.current) return;
        lastSigRef.current = sig;

        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (distanceFromBottom <= NEAR_BOTTOM_PX) {
            el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        }
    }, [items, newestId, newestStatus]);

    if (items.length === 0) {
        return <EmptyState modelName={modelName} />;
    }

    return (
        <div
            ref={listRef}
            className="scrollbar-hide flex-1 overflow-y-auto px-3 py-3"
            aria-label="Generation history"
        >
            {/* Oldest first, newest at the bottom — chat/composer reading order. */}
            <ul className="flex flex-col gap-4 pt-1">
                {items
                    .slice()
                    .reverse()
                    .map((item) => (
                        <li key={item.id}>
                            <GenerationItem
                                item={item}
                                isActive={item.id === newestId}
                                viewMode={viewMode}
                                onRemove={() => onRemove(item.id)}
                                onRegenerate={onRegenerate ? () => onRegenerate(item) : undefined}
                            />
                        </li>
                    ))}
            </ul>
        </div>
    );
}

function EmptyState({ modelName }: { modelName?: string }) {
    return (
        <div className="flex flex-1 items-center justify-center px-6 py-10 text-center">
            <div className="max-w-[28ch]">
                <p className="text-sm font-medium">No generations yet</p>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                    Send a prompt to{" "}
                    <span className="font-mono text-foreground">
                        {modelName ?? "the selected model"}
                    </span>{" "}
                    to see its raw completion here.
                </p>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    Each prompt is a fresh context — generations don&rsquo;t share memory.
                </p>
            </div>
        </div>
    );
}
