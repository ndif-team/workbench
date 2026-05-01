"use client";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Layers } from "lucide-react";
import { useIsMutating } from "@tanstack/react-query";
import ChartCardsSidebar from "../../components/ChartCardsSidebar";
import { MobileSidebarDrawer } from "../../components/MobileSidebarDrawer";
import { MobileCollapsibleControls } from "../../components/MobileCollapsibleControls";
import BranchingArea from "./components/BranchingArea";
import { BranchingDisplay } from "./components/BranchingDisplay";

export default function BranchingChartPage() {
    const isMobile = useIsMobile();
    const isRunning = useIsMutating({ mutationKey: ["branchingGenerate"] }) > 0;

    if (isMobile === undefined) return null;

    if (isMobile) {
        return (
            <div className="size-full flex flex-col min-h-0 overflow-auto p-2 pb-20 gap-2">
                <MobileCollapsibleControls
                    label="Branching"
                    icon={Layers}
                    isRunning={isRunning}
                >
                    <BranchingArea />
                </MobileCollapsibleControls>
                <div className="rounded dark:bg-secondary/50 bg-secondary/80 border min-h-[50vh] flex-1">
                    <BranchingDisplay />
                </div>
                <MobileSidebarDrawer />
            </div>
        );
    }

    return (
        <div className="size-full flex min-h-0">
            <ChartCardsSidebar />
            <div className="flex-1 min-h-0 pb-3 pr-3">
                <ResizablePanelGroup
                    direction="horizontal"
                    className="flex size-full rounded dark:bg-secondary/50 bg-secondary/80 border"
                >
                    <ResizablePanel className="h-full" defaultSize={28} minSize={20}>
                        <BranchingArea />
                    </ResizablePanel>
                    <ResizableHandle className="w-[0.8px]" />
                    <ResizablePanel defaultSize={72} minSize={40}>
                        <BranchingDisplay />
                    </ResizablePanel>
                </ResizablePanelGroup>
            </div>
        </div>
    );
}
