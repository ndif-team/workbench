import { useEffect, useRef } from "react";
import { motion } from "motion/react";

/** How long each prediction stays on screen, and its fade out and in. */
const HOLD_MS = 1200;
const FADE_MS = 400;

/** A prediction shown, and where it fades out to and in from. */
const SHOWN = { opacity: "1", transform: "none" };
const ABOVE = { opacity: "0", transform: "translateY(-12px)" };
const BELOW = { opacity: "0", transform: "translateY(12px)" };

export default function PromptVisualization() {
    const tokens = [
        "The",
        " E",
        "iff",
        "el",
        " Tower",
        " is",
        " located",
        " in",
        " the",
        " city",
        " of",
    ];

    // const predictions = [" Paris", " London", " Amsterdam", " Europe"];
    const predictions = [
        { text: " Paris", prob: 0.063 },
        { text: " London", prob: 0.0461 },
        { text: " Amsterdam", prob: 0.034 },
        { text: " New", prob: 0.031 },
        { text: " Berlin", prob: 0.026 },
    ];

    // The predictions sit stacked in one spot; one sequence fades the shown
    // one out and the next in, then holds it. A change never starts before
    // the last one finished, so a busy page only delays the cycle (a timer
    // could fire twice within one fade, skipping a label mid-animation).
    // A label's own style takes a fade's end state as the fade starts, so a
    // frame drawn as the browser hands the finished fade back to the page
    // (Dia draws one) shows that end state rather than flashing the start.
    const stack = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const labels = stack.current?.querySelectorAll<HTMLElement>("[data-label]");
        if (!labels?.length) return;
        let stopped = false;
        const hold = () => new Promise((resolve) => setTimeout(resolve, HOLD_MS));
        const fade = (label: HTMLElement, from: Keyframe, to: Keyframe) => {
            Object.assign(label.style, to);
            return label.animate([from, to], {
                duration: FADE_MS,
                easing: "ease-out",
                fill: "both",
            }).finished;
        };
        (async () => {
            for (let i = 0; ; i = (i + 1) % labels.length) {
                await hold();
                if (stopped) return;
                await fade(labels[i], SHOWN, ABOVE);
                if (stopped) return;
                await fade(labels[(i + 1) % labels.length], BELOW, SHOWN);
            }
        })();
        return () => {
            stopped = true;
        };
    }, []);

    const attentions = [0.05, 0.78, 0.56, 0.33, 0.88, 0.44, 0.63, 0.17, 0.08, 0.51, 0.15];

    const getAttentionColor = (score: number) => {
        // Higher score = darker blue (you can swap hue for orange/red)
        const alpha = 0.1 + score * 0.65;
        return `rgba(147, 197, 253, ${alpha})`; // Tailwind blue-300 RGB with dynamic opacity
    };

    return (
        <div className="flex items-start justify-center text-sm sm:text-lg md:text-2xl monitor:text-3xl wide:text-4xl font-mono rounded-2xl px-2 sm:px-4 md:px-8 py-4 md:py-6 flex-wrap">
            {tokens.map((token, i) => (
                <motion.span
                    key={i}
                    animate={{ backgroundColor: getAttentionColor(attentions[i]) }}
                    transition={{ duration: 0.6 }}
                    className="font-times italic mx-[1px] text-foreground/90"
                >
                    {token}
                </motion.span>
            ))}

            <div
                ref={stack}
                aria-hidden
                className="relative inline-flex w-[80px] sm:w-[110px] md:w-[140px] monitor:w-[175px] wide:w-[210px] align-top"
            >
                {predictions.map((prediction, i) => (
                    <div
                        key={prediction.text}
                        data-label={i}
                        style={i === 0 ? SHOWN : BELOW}
                        className="absolute top-0 left-0 flex flex-col items-end px-2 pr-2 pb-2 rounded-md text-primary font-semibold whitespace-nowrap"
                    >
                        <span>{prediction.text}</span>
                        <span className="mt-[1px] translate-x-[4px] text-[0.40em] font-bold text-purple-500 leading-none">
                            {prediction.prob}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
