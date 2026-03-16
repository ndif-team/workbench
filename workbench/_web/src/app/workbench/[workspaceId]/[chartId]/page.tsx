"use client";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

import ChartCardsSidebar from "../components/ChartCardsSidebar";
import LensArea from "./components/lens/LensArea";
// import SimplePatchArea from "./components/patch/SimplePatchArea";
import { ChartDisplay } from "@/components/charts/ChartDisplay";
import { useIsMobile } from "@/hooks/useIsMobile";
import { MobileSidebarDrawer } from "../components/MobileSidebarDrawer";
import { MobileCollapsibleControls } from "../components/MobileCollapsibleControls";
import { Search } from "lucide-react";
import { useIsMutating } from "@tanstack/react-query";

export default function ChartPage() {
    const isMobile = useIsMobile();
    const isRunning = useIsMutating({ mutationKey: ["lensLine"] }) + useIsMutating({ mutationKey: ["lensGrid"] }) > 0;

    if (isMobile === undefined) return null;

    if (isMobile) {
        return (
            <div className="size-full flex flex-col min-h-0 overflow-auto p-2 pb-20 gap-2">
                <MobileCollapsibleControls label="Lens" icon={Search} isRunning={isRunning}>
                    <LensArea />
                </MobileCollapsibleControls>
                <div className="rounded dark:bg-secondary/50 bg-secondary/80 border min-h-[50vh] flex-1">
                    <ChartDisplay />
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
                    <ResizablePanel className="h-full" defaultSize={30} minSize={30}>
                        <LensArea />
                    </ResizablePanel>
                    <ResizableHandle className="w-[0.8px]" />
                    <ResizablePanel defaultSize={50} minSize={30}>
                        <ChartDisplay />
                    </ResizablePanel>
                </ResizablePanelGroup>
            </div>
        </div>
    );
}
