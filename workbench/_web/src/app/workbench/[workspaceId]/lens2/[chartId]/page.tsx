"use client";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import ChartCardsSidebar from "../../components/ChartCardsSidebar";
import Lens2Area from "./components/Lens2Area";
import { Lens2Display } from "./components/Lens2Display";
import { useIsMobile } from "@/hooks/useIsMobile";
import { MobileSidebarDrawer } from "../../components/MobileSidebarDrawer";
import { MobileCollapsibleControls } from "../../components/MobileCollapsibleControls";
import { Layers } from "lucide-react";
import { useIsMutating } from "@tanstack/react-query";

export default function Lens2ChartPage() {
    const isMobile = useIsMobile();
    const isRunning = useIsMutating({ mutationKey: ["lens2"] }) > 0;

    if (isMobile === undefined) return null;

    if (isMobile) {
        return (
            <div className="size-full flex flex-col min-h-0 overflow-auto p-2 pb-20 gap-2">
                <MobileCollapsibleControls label="Lens 2" icon={Layers} isRunning={isRunning}>
                    <Lens2Area />
                </MobileCollapsibleControls>
                <div className="rounded dark:bg-secondary/50 bg-secondary/80 border min-h-[50vh] flex-1">
                    <Lens2Display />
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
                    <ResizablePanel className="h-full" defaultSize={25} minSize={20}>
                        <Lens2Area />
                    </ResizablePanel>
                    <ResizableHandle className="w-[0.8px]" />
                    <ResizablePanel defaultSize={75} minSize={40}>
                        <Lens2Display />
                    </ResizablePanel>
                </ResizablePanelGroup>
            </div>
        </div>
    );
}
