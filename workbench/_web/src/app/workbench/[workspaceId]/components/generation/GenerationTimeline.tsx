"use client";

import { useEffect, useRef } from "react";
import { GenerationItem } from "./GenerationItem";
import type { GenerationItem as GenerationItemType } from "@/types/generation";

interface GenerationTimelineProps {
    items: GenerationItemType[];
    onRemove: (id: string) => void;
    onRegenerate?: (item: GenerationItemType) => void;
    modelName?: string;
}

const NEAR_TOP_PX = 120;

export function GenerationTimeline({
    items,
    onRemove,
    onRegenerate,
    modelName,
}: GenerationTimelineProps) {
    const listRef = useRef<HTMLDivElement>(null);
    const lastTopIdRef = useRef<string | undefined>(undefined);

    useEffect(() => {
        const topId = items[0]?.id;
        if (!topId || topId === lastTopIdRef.current) return;
        lastTopIdRef.current = topId;
        const el = listRef.current;
        if (!el) return;
        if (el.scrollTop <= NEAR_TOP_PX) {
            el.scrollTo({ top: 0, behavior: "smooth" });
        }
    }, [items]);

    if (items.length === 0) {
        return <EmptyState modelName={modelName} />;
    }

    return (
        <div
            ref={listRef}
            className="flex-1 overflow-y-auto px-3 py-3 scrollbar-hide"
            aria-label="Generation history"
        >
            <ul className="flex flex-col gap-4 pb-1">
                {items.map((item, idx) => (
                    <li key={item.id}>
                        <GenerationItem
                            item={item}
                            isActive={idx === 0}
                            onRemove={() => onRemove(item.id)}
                            onRegenerate={
                                onRegenerate ? () => onRegenerate(item) : undefined
                            }
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
