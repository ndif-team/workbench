import { useEffect } from "react";
import { motion, useAnimate } from "motion/react";

/** How long each prediction stays on screen, and its fade out and in. */
const HOLD_MS = 1200;
const FADE_S = 0.4;

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
    const [scope, animate] = useAnimate();

    useEffect(() => {
        let stopped = false;
        const hold = () => new Promise((resolve) => setTimeout(resolve, HOLD_MS));
        const label = (i: number) => `[data-label="${i}"]`;
        (async () => {
            for (let i = 0; ; i = (i + 1) % predictions.length) {
                await hold();
                if (stopped) return;
                await animate(label(i), { opacity: 0, y: -12 }, { duration: FADE_S });
                if (stopped) return;
                const next = (i + 1) % predictions.length;
                await animate(label(next), { opacity: [0, 1], y: [12, 0] }, { duration: FADE_S });
            }
        })();
        return () => {
            stopped = true;
        };
    }, [animate, predictions.length]);

    const attentions = [0.05, 0.78, 0.56, 0.33, 0.88, 0.44, 0.63, 0.17, 0.08, 0.51, 0.15];

    const getAttentionColor = (score: number) => {
        // Higher score = darker blue (you can swap hue for orange/red)
        const alpha = 0.1 + score * 0.65;
        return `rgba(147, 197, 253, ${alpha})`; // Tailwind blue-300 RGB with dynamic opacity
    };

    return (
        <div className="flex items-start justify-center text-sm sm:text-lg md:text-2xl font-mono rounded-2xl px-2 sm:px-4 md:px-8 py-4 md:py-6 flex-wrap">
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
                ref={scope}
                aria-hidden
                className="relative inline-flex w-[80px] sm:w-[110px] md:w-[140px] align-top"
            >
                {predictions.map((prediction, i) => (
                    <div
                        key={prediction.text}
                        data-label={i}
                        style={{ opacity: i === 0 ? 1 : 0 }}
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
