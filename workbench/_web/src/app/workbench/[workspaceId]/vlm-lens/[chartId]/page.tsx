"use client";

import { useIsMobile } from "@/hooks/useIsMobile";
import { useIsMutating } from "@tanstack/react-query";
import { Image as ImageIcon } from "lucide-react";

import ChartCardsSidebar from "../../components/ChartCardsSidebar";
import { MobileCollapsibleControls } from "../../components/MobileCollapsibleControls";
import { MobileSidebarDrawer } from "../../components/MobileSidebarDrawer";
import VlmLensArea from "./components/VlmLensArea";
import { VlmLensDisplay } from "./components/VlmLensDisplay";

// Input column is fixed-width: 320px segmentation widget + p-3 + ~50px slack
// for the legend/sliders' right-aligned counts.
const INPUT_COL_PX = 382;

export default function VlmLensChartPage() {
    const isMobile = useIsMobile();
    const isRunning = useIsMutating({ mutationKey: ["vlm-lens"] }) > 0;

    if (isMobile === undefined) return null;

    if (isMobile) {
        return (
            <div className="size-full flex flex-col min-h-0 overflow-auto p-2 pb-20 gap-2">
                <MobileCollapsibleControls
                    label="VLM Logit Lens"
                    icon={ImageIcon}
                    isRunning={isRunning}
                >
                    <VlmLensArea />
                </MobileCollapsibleControls>
                <div className="rounded dark:bg-secondary/50 bg-secondary/80 border min-h-[50vh] flex-1">
                    <VlmLensDisplay />
                </div>
                <MobileSidebarDrawer />
            </div>
        );
    }

    return (
        <div className="size-full flex min-h-0">
            <ChartCardsSidebar />
            <div className="flex-1 min-h-0 pb-3 pr-3">
                <div className="flex size-full rounded dark:bg-secondary/50 bg-secondary/80 border">
                    <div className="h-full shrink-0" style={{ width: INPUT_COL_PX }}>
                        <VlmLensArea />
                    </div>
                    <div className="w-px bg-border shrink-0" />
                    <div className="flex-1 min-w-0 overflow-hidden">
                        <VlmLensDisplay />
                    </div>
                </div>
            </div>
        </div>
    );
}
