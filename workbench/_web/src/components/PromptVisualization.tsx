import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

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
        { text: " Paris", prob: 0.063},
        { text: " London", prob: 0.0461},
        { text: " Amsterdam", prob: 0.034},
        { text: " New", prob: 0.031},
        { text: " Berlin", prob: 0.026},
    ];
    
    const [index, setIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setIndex((prev) => (prev + 1) % predictions.length);
        }, 2000);

        return () => clearInterval(interval);
    }, []);


    const current = predictions[index];

    const attentions = [0.05, 0.78, 0.56, 0.33, 0.88, 0.44, 0.63, 0.17, 0.08, 0.51, 0.15];

    const getAttentionColor = (score: number) => {
        // Higher score = darker blue (you can swap hue for orange/red)
        const alpha = 0.1 + score * 0.65;
        return `rgba(147, 197, 253, ${alpha})`; // Tailwind blue-300 RGB with dynamic opacity
      };

    return (
        <div className="flex items-start justify-center text-2xl font-mono rounded-2xl px-8 py-6 backdrop-blur-sm whitespace-nowrap">
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

            <div className="relative inline-flex w-[140px] align-top">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={current.text}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        transition={{ duration: 0.4 }}
                        className="absolute top-0 left-0 flex flex-col items-end px-2 pr-2 pb-2 rounded-md text-primary font-semibold whitespace-nowrap"
                    >
                        <span>{current.text}</span>
                        <span className="mt-[1px] translate-x-[4px] text-[0.40em] font-bold text-purple-500 leading-none">
                            {current.prob}
                        </span>
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}