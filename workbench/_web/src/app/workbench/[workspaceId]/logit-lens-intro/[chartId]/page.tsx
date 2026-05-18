"use client";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import ChartCardsSidebar from "../../components/ChartCardsSidebar";
import LogitLensIntroArea from "./components/LogitLensIntroArea";
import { LogitLensIntroDisplay } from "./components/LogitLensIntroDisplay";
import { useIsMobile } from "@/hooks/useIsMobile";
import { MobileSidebarDrawer } from "../../components/MobileSidebarDrawer";
import { MobileCollapsibleControls } from "../../components/MobileCollapsibleControls";
import { GraduationCap } from "lucide-react";
import { useIsMutating } from "@tanstack/react-query";

export default function LogitLensIntroChartPage() {
    const isMobile = useIsMobile();
    const isRunning = useIsMutating({ mutationKey: ["logitLensIntro"] }) > 0;

    if (isMobile === undefined) return null;

    if (isMobile) {
        return (
            <div className="size-full flex flex-col min-h-0 overflow-auto p-2 pb-20 gap-2">
                <MobileCollapsibleControls
                    label="Logit Lens Intro"
                    icon={GraduationCap}
                    isRunning={isRunning}
                >
                    <LogitLensIntroArea />
                </MobileCollapsibleControls>
                <div className="rounded dark:bg-secondary/50 bg-secondary/80 border min-h-[50vh] flex-1">
                    <LogitLensIntroDisplay />
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
                        <LogitLensIntroArea />
                    </ResizablePanel>
                    <ResizableHandle className="w-[0.8px]" />
                    <ResizablePanel defaultSize={75} minSize={40}>
                        <LogitLensIntroDisplay />
                    </ResizablePanel>
                </ResizablePanelGroup>
            </div>
        </div>
    );
}
