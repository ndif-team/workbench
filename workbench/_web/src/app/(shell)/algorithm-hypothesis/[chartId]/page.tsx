"use client";

import { useIsMobile } from "@/hooks/useIsMobile";
import AlgorithmHypothesisArea from "./components/AlgorithmHypothesisArea";

export default function AlgorithmHypothesisChartPage() {
    const isMobile = useIsMobile();
    if (isMobile === undefined) return null;

    if (isMobile) {
        return (
            <div className="size-full flex flex-col min-h-0 overflow-auto p-2 pb-20 gap-2">
                <AlgorithmHypothesisArea mobile />
            </div>
        );
    }

    return (
        <div className="size-full flex min-h-0 pb-3 px-3">
            <AlgorithmHypothesisArea />
        </div>
    );
}
