"use client";

import { TourProvider as ReactourTourProvider, type PopoverContentProps } from "@reactour/tour";
import React, { type ReactNode } from "react";

interface TourProviderProps {
  children: ReactNode;
}

function ContentComponent({
  currentStep,
  steps,
  setIsOpen,
  setCurrentStep,
  ...props
}: PopoverContentProps) {
  const content = steps[currentStep].content;

  if (typeof content === "function") {
    return <div>Unsupported content type</div>;
  }

  if (steps[currentStep].selector === "sidebar") {
    return <></>;
  }

  return (
    <div className="bg-card border w-full h-full p-4 rounded">
      {renderTextWithBackticks(content as string)}
    </div>
  );
}

export function TourProvider({ children }: TourProviderProps) {
  const [dimensions, setDimensions] = React.useState({
    tutorialBarWidth: 0,
    menuBarHeight: 0,
  });

  React.useEffect(() => {
    const tutorialBarWidth = window.innerWidth * 0.25;
    const menuBarHeight = window.innerHeight * 0.06;

    setDimensions({
      tutorialBarWidth,
      menuBarHeight,
    });
  }, []);

  return (
    <ReactourTourProvider
      steps={[]}
      ContentComponent={ContentComponent}
      styles={{
        maskWrapper: (base) => ({ ...base, cursor: "not-allowed" }),
        popover: (base) => ({ ...base, padding: 0, backgroundColor: "transparent" }),
      }}
      padding={{
        wrapper: [dimensions.menuBarHeight, 0, 0, dimensions.tutorialBarWidth],
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
