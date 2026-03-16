"use client";

import { useState, useEffect, useRef } from "react";
import { PanelLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import ChartCardsSidebar from "./ChartCardsSidebar";

export function MobileSidebarDrawer() {
    const [open, setOpen] = useState(false);
    const drawerRef = useRef<HTMLDivElement>(null);

    // Escape key to close + focus trap
    useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("keydown", onKeyDown);

        // Focus the drawer when it opens
        drawerRef.current?.focus();

        return () => document.removeEventListener("keydown", onKeyDown);
    }, [open]);

    return (
        <>
            <Button
                variant="outline"
                size="icon"
                aria-label="Open charts sidebar"
                onClick={() => setOpen(true)}
                className="fixed bottom-4 left-4 z-40 h-11 w-11 rounded-full shadow-lg bg-card border-border/60 hover:bg-accent"
            >
                <PanelLeft className="h-5 w-5" />
            </Button>

            {open && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
                        onClick={() => setOpen(false)}
                    />
                    {/* Drawer */}
                    <div
                        ref={drawerRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Charts sidebar"
                        tabIndex={-1}
                        className="fixed inset-y-0 left-0 z-50 w-[80vw] max-w-sm flex flex-col animate-in slide-in-from-left duration-200 shadow-2xl border-r border-border/40 bg-gradient-to-b from-card to-background dark:from-card dark:to-background [animation-timing-function:cubic-bezier(0.25,1,0.5,1)] outline-none"
                    >
                        <div className="flex items-center justify-between px-4 py-4 border-b border-border/40">
                            <span className="text-sm font-medium text-muted-foreground">Charts</span>
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Close charts sidebar"
                                onClick={() => setOpen(false)}
                                className="h-10 w-10 rounded-full hover:bg-muted"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                        <div className="flex-1 min-h-0 overflow-auto">
                            <ChartCardsSidebar fillWidth />
                        </div>
                    </div>
                </>
            )}
        </>
    );
}
