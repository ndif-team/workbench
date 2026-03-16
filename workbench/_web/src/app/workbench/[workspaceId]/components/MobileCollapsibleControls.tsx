"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, type LucideIcon } from "lucide-react";

export function MobileCollapsibleControls({
    children,
    label,
    icon: Icon,
    isRunning = false,
}: {
    children: ReactNode;
    label: string;
    icon: LucideIcon;
    isRunning?: boolean;
}) {
    const [collapsed, setCollapsed] = useState(false);
    const wasRunning = useRef(false);

    // Auto-collapse when computation starts (false -> true transition)
    useEffect(() => {
        if (isRunning && !wasRunning.current) {
            setCollapsed(true);
        }
        wasRunning.current = isRunning;
    }, [isRunning]);

    if (collapsed) {
        return (
            <button
                aria-label={`Expand ${label}`}
                onClick={() => setCollapsed(false)}
                className="shrink-0 w-full flex items-center justify-between h-8 px-3 rounded-md dark:bg-secondary/50 bg-secondary/80 border border-border/60 hover:bg-secondary hover:border-border active:scale-[0.99] transition-all duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 group"
            >
                <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-primary/70 group-hover:text-primary transition-colors" />
                    <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
            </button>
        );
    }

    return (
        <div className="shrink-0 relative pb-3">
            <div className="rounded dark:bg-secondary/50 bg-secondary/80 border">
                {children}
            </div>
            <button
                aria-label={`Collapse ${label}`}
                onClick={() => setCollapsed(true)}
                className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 flex items-center justify-center h-7 w-7 rounded-full bg-card border border-border/60 shadow-sm text-muted-foreground/70 hover:bg-muted hover:text-foreground active:bg-muted z-10 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            >
                <ChevronUp className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}
