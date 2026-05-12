"use client";

import type { CSSProperties, ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { ChartMetadata } from "@/types/charts";
import type { DocumentListItem } from "@/lib/queries/documentQueries";

export type SidebarEntry =
    | { type: "chart"; item: ChartMetadata }
    | { type: "report"; item: DocumentListItem };

export const entryKey = (entry: SidebarEntry) => `${entry.type}-${entry.item.id}`;

export function SortableEntry({ id, children }: { id: string; children: ReactNode }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style: CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 20 : "auto",
    };

    return (
        <div ref={setNodeRef} style={style} className="relative group/sortable">
            <button
                ref={setActivatorNodeRef}
                {...attributes}
                {...listeners}
                type="button"
                aria-label="Drag to reorder"
                className="absolute left-1 top-1/2 -translate-y-1/2 z-20 flex h-8 w-5 items-center justify-center rounded bg-background/70 text-muted-foreground/60 opacity-60 group-hover/sortable:opacity-100 hover:bg-background/90 hover:text-foreground cursor-grab active:cursor-grabbing transition-opacity"
                onClick={(e) => e.stopPropagation()}
            >
                <GripVertical className="h-4 w-4" />
            </button>
            {children}
        </div>
    );
}
