"use client";

import ChartCardsSidebar from "../../components/ChartCardsSidebar";
import { MobileSidebarDrawer } from "../../components/MobileSidebarDrawer";
import { useIsMobile } from "@/hooks/useIsMobile";
import AlgorithmHypothesisArea from "./components/AlgorithmHypothesisArea";

export default function AlgorithmHypothesisChartPage() {
    const isMobile = useIsMobile();
    if (isMobile === undefined) return null;

    if (isMobile) {
        return (
            <div className="size-full flex flex-col min-h-0 overflow-auto p-2 pb-20 gap-2">
                <AlgorithmHypothesisArea mobile />
                <MobileSidebarDrawer />
            </div>
        );
    }

    return (
        <div className="size-full flex min-h-0">
            <ChartCardsSidebar />
            <div className="flex-1 min-w-0 min-h-0 pb-3 pr-3 flex">
                <AlgorithmHypothesisArea />
            </div>
        </div>
    );
}
