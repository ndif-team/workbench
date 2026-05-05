"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GenerationRail } from "./GenerationRail";

export function MobileGenerationDrawer() {
    const [open, setOpen] = useState(false);
    const drawerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("keydown", onKeyDown);
        drawerRef.current?.focus();
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [open]);

    return (
        <>
            <Button
                variant="outline"
                size="icon"
                aria-label="Open text generation panel"
                onClick={() => setOpen(true)}
                className="fixed bottom-4 right-4 z-40 h-11 w-11 rounded-full shadow-lg bg-card border-border/60 hover:bg-accent"
            >
                <MessageSquareText className="h-5 w-5" />
            </Button>

            {open && (
                <>
                    <div
                        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
                        onClick={() => setOpen(false)}
                    />
                    <div
                        ref={drawerRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Text generation"
                        tabIndex={-1}
                        className="fixed inset-y-0 right-0 z-50 flex w-[88vw] max-w-md flex-col animate-in slide-in-from-right duration-200 border-l border-border/40 bg-card shadow-2xl outline-none [animation-timing-function:cubic-bezier(0.25,1,0.5,1)]"
                    >
                        <div className="flex-1 min-h-0 flex flex-col">
                            <GenerationRail onCollapse={() => setOpen(false)} />
                        </div>
                    </div>
                </>
            )}
        </>
    );
}
