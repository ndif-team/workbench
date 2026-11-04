"use client";

import * as React from "react";
import { Slider as SliderPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * A range slider, one thumb per value. The filled part of the track is the
 * primary blue; the thumb takes the inputs' focus ring, shows it softly on
 * hover, and grows a little while dragged.
 */
const Slider = React.forwardRef<
    React.ElementRef<typeof SliderPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => {
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
            <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/15">
                <SliderPrimitive.Range className="absolute h-full rounded-full bg-primary" />
            </SliderPrimitive.Track>
            {Array.from({ length: thumbs }, (_, i) => (
                <SliderPrimitive.Thumb
                    key={i}
                    className={cn(
                        "block size-4 shrink-0 cursor-grab rounded-full border-2 border-primary bg-background shadow-sm outline-none ring-ring/50 transition-[box-shadow,transform]",
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
