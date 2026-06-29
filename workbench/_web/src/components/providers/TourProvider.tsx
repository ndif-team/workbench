"use client";

import { TourProvider as ReactourTourProvider, type PopoverContentProps } from "@reactour/tour";
import React, { type ReactNode } from "react";

interface TourProviderProps {
    children: ReactNode;
}

function ContentComponent({ currentStep, steps, setIsOpen, setCurrentStep }: PopoverContentProps) {
    const step = steps[currentStep];
    const content = step.content;

    if (typeof content === "function") {
        return <div>Unsupported content type</div>;
    }

    if (step.selector === "sidebar") {
        return <></>;
    }

    const isFirst = currentStep === 0;
    const isLast = currentStep === steps.length - 1;

    return (
        <div className="bg-card border rounded flex flex-col gap-3 p-4 w-full h-full min-w-[280px] max-w-[420px]">
            <div className="flex-1 overflow-auto text-sm leading-relaxed">
                {renderTextWithBackticks(content as string)}
            </div>
            <div className="flex items-center justify-between gap-2 border-t pt-2">
                <span className="text-xs text-muted-foreground">
                    {currentStep + 1} / {steps.length}
                </span>
                <div className="flex items-center gap-2">
                    {!isFirst && (
                        <button
                            type="button"
                            onClick={() => setCurrentStep(currentStep - 1)}
                            className="text-xs px-2 py-1 rounded border hover:bg-muted transition-colors"
                        >
                            Prev
                        </button>
                    )}
                    {!isLast ? (
                        <button
                            type="button"
                            onClick={() => setCurrentStep(currentStep + 1)}
                            className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                        >
                            Next
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                        >
                            Done
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setIsOpen(false)}
                        aria-label="Close tour"
                        title="Close tour"
                        className="text-xs px-2 py-1 rounded border hover:bg-muted transition-colors"
                    >
                        ×
                    </button>
                </div>
            </div>
        </div>
    );
}

export function TourProvider({ children }: TourProviderProps) {
    return (
        <ReactourTourProvider
            steps={[]}
            ContentComponent={ContentComponent}
            styles={{
                maskWrapper: (base) => ({ ...base, cursor: "not-allowed" }),
                popover: (base) => ({ ...base, padding: 0, backgroundColor: "transparent" }),
            }}
        >
            {children}
        </ReactourTourProvider>
    );
}

interface ParsedSegment {
    type: "text" | "code";
    content: string;
}

export function parseBackticks(text: string): ParsedSegment[] {
    const segments: ParsedSegment[] = [];
    let currentIndex = 0;

    while (currentIndex < text.length) {
        const nextBacktick = text.indexOf("`", currentIndex);

        if (nextBacktick === -1) {
            // No more backticks, add remaining text
            if (currentIndex < text.length) {
                segments.push({
                    type: "text",
                    content: text.slice(currentIndex),
                });
            }
            break;
        }

        // Add text before backtick
        if (nextBacktick > currentIndex) {
            segments.push({
                type: "text",
                content: text.slice(currentIndex, nextBacktick),
            });
        }

        // Find closing backtick
        const closingBacktick = text.indexOf("`", nextBacktick + 1);

        if (closingBacktick === -1) {
            // No closing backtick, treat as regular text
            segments.push({
                type: "text",
                content: text.slice(nextBacktick),
            });
            break;
        }

        // Add code segment
        segments.push({
            type: "code",
            content: text.slice(nextBacktick + 1, closingBacktick),
        });

        currentIndex = closingBacktick + 1;
    }

    return segments;
}

export function renderTextWithBackticks(text: string): React.ReactElement {
    const segments = parseBackticks(text);

    return (
        <span>
            {segments.map((segment, index) => {
                if (segment.type === "code") {
                    return (
                        <code
                            key={index}
                            className="bg-muted text-foreground px-1.5 py-0.5 rounded text-sm font-mono border"
                        >
                            {segment.content}
                        </code>
                    );
                }
                // Split text by newlines and render each part with line breaks
                return segment.content.split("\n").map((line, lineIndex) => (
                    <React.Fragment key={`${index}-${lineIndex}`}>
                        {lineIndex > 0 && <br />}
                        {line}
                    </React.Fragment>
                ));
            })}
        </span>
    );
}
