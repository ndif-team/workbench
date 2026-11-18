"use client";

import * as React from "react";
import { Slider as SliderPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * A range slider, one thumb per value. The filled part of the track is the
 * primary blue, or the tools' accent with `tone="tool"`; the thumb takes a
 * focus ring of the same color, shows it softly on hover, and grows a little
 * while dragged.
 */
const TONES = {
    primary: { track: "bg-primary/15", range: "bg-primary", thumb: "border-primary ring-ring/50" },
    tool: {
        track: "bg-tool-accent/15",
        range: "bg-tool-accent",
        thumb: "border-tool-accent ring-tool-accent/50",
    },
} as const;

const Slider = React.forwardRef<
    React.ElementRef<typeof SliderPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & { tone?: keyof typeof TONES }
>(({ className, tone = "primary", ...props }, ref) => {
    const look = TONES[tone];
    const thumbs = (props.value ?? props.defaultValue ?? [props.min ?? 0]).length;
    return (
        <SliderPrimitive.Root
            ref={ref}
            className={cn(
                "group/slider relative flex w-full touch-none select-none items-center data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
                className,
            )}
            {...props}
        >
            <SliderPrimitive.Track
                className={cn(
                    "relative h-1.5 w-full grow overflow-hidden rounded-full",
                    look.track,
                )}
            >
                <SliderPrimitive.Range className={cn("absolute h-full rounded-full", look.range)} />
            </SliderPrimitive.Track>
            {Array.from({ length: thumbs }, (_, i) => (
                <SliderPrimitive.Thumb
                    key={i}
                    className={cn(
                        "block size-4 shrink-0 cursor-grab rounded-full border-2 bg-background shadow-sm outline-none transition-[box-shadow,transform]",
                        look.thumb,
                        "hover:ring-4 focus-visible:ring-[3px] active:scale-110 active:cursor-grabbing",
                        "group-data-[disabled]/slider:cursor-not-allowed group-data-[disabled]/slider:shadow-none group-data-[disabled]/slider:ring-0",
                    )}
                />
            ))}
        </SliderPrimitive.Root>
    );
});
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
