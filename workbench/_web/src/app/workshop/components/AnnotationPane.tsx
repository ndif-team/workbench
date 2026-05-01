"use client";

import { useEffect, useState, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { saveWorkshopAnnotation } from "@/actions/workshop";

interface AnnotationPaneProps {
    exampleId: string;
    initialAnnotation: string;
}

const DEBOUNCE_MS = 600;

export function AnnotationPane({ exampleId, initialAnnotation }: AnnotationPaneProps) {
    const [text, setText] = useState(initialAnnotation);
    const [savedFlash, setSavedFlash] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(async () => {
            await saveWorkshopAnnotation({ exampleId, annotationText: text });
            setSavedFlash(true);
            setTimeout(() => setSavedFlash(false), 800);
        }, DEBOUNCE_MS);
        return () => {
            if (timer.current) clearTimeout(timer.current);
        };
    }, [text, exampleId]);

    return (
        <section
            data-testid="annotation-pane"
            className="rounded-md border bg-muted/30 p-3 flex flex-col gap-2"
        >
            <div className="flex items-center justify-between">
                <label htmlFor="annotation-text" className="text-sm font-medium">
                    Your reflection
                </label>
                <span
                    className="text-xs text-muted-foreground"
                    data-testid="annotation-saved-indicator"
                    data-state={savedFlash ? "flashing" : "idle"}
                >
                    {savedFlash ? "Saved" : ""}
                </span>
            </div>
            <Textarea
                id="annotation-text"
                data-testid="annotation-textarea"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="1–2 sentences on what you noticed."
                rows={3}
            />
        </section>
    );
}
