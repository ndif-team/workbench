"use client";

import { LogitLensGrid } from "edulogitlens";
import type { LogitLensData, LogitCell } from "edulogitlens";

function generateMockData(): LogitLensData {
    const tokens = [
        "The",
        "E",
        "iff",
        "el",
        "Tower",
        "is",
        "in",
        "the",
        "city",
        "of",
        "Paris",
        ",",
        "France",
        ".",
    ];

    const layers = Array.from({ length: 12 }, (_, i) => i);

    const vocab = [
        "t",
        "bow",
        "illi",
        "Tower",
        "el",
        "France",
        "Paris",
        "tower",
        "city",
        "of",
        "the",
        "in",
        "is",
        "a",
        "and",
        "Eiff",
        "to",
        "built",
        "was",
        "meters",
        "at",
        "by",
        "from",
        "with",
        "on",
        "for",
        "an",
        "stands",
        "tall",
    ];

    const data: LogitCell[][] = tokens.map((token) => {
        return layers.map((_, layerIdx) => {
            const convergence = layerIdx / layers.length;

            let primaryToken = token;
            let prob: number;

            if (convergence < 0.3) {
                primaryToken = vocab[Math.floor(Math.random() * vocab.length)];
                prob = 0.05 + Math.random() * 0.15;
            } else if (convergence < 0.6) {
                primaryToken =
                    Math.random() > 0.5 ? token : vocab[Math.floor(Math.random() * vocab.length)];
                prob = 0.2 + Math.random() * 0.3;
            } else {
                primaryToken = token;
                prob = 0.5 + convergence * 0.4 + Math.random() * 0.1;
            }
            prob = Math.min(prob, 0.95);

            const topTokens: { token: string; prob: number }[] = [{ token: primaryToken, prob }];
            let remaining = (1 - prob) * 0.4;
            for (let i = 0; i < 14; i++) {
                const candidate = vocab[Math.floor(Math.random() * vocab.length)];
                topTokens.push({ token: candidate, prob: remaining });
                remaining *= 0.7;
            }

            return { token: primaryToken, probability: prob, topTokens };
        });
    });

    return { tokens, layers, data };
}

const MOCK_DATA = generateMockData();

export default function DevLogitLensIntroPage() {
    return (
        <div className="w-full h-screen p-4">
            <h1 className="text-lg font-semibold mb-4">Logit Lens Intro — Dev Preview</h1>
            <div className="w-full h-[calc(100vh-80px)]">
                <LogitLensGrid data={MOCK_DATA} />
            </div>
        </div>
    );
}
