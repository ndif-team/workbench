"use client";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import ChartCardsSidebar from "../../components/ChartCardsSidebar";
import ActivationPatchingArea from "./components/ActivationPatchingArea";
import { ActivationPatchingDisplay } from "./components/ActivationPatchingDisplay";
import { useIsMobile } from "@/hooks/useIsMobile";
import { MobileSidebarDrawer } from "../../components/MobileSidebarDrawer";
import { MobileCollapsibleControls } from "../../components/MobileCollapsibleControls";
import { GitBranch } from "lucide-react";
import { useIsMutating } from "@tanstack/react-query";

export default function ActivationPatchingPage() {
    const isMobile = useIsMobile();
    const isRunning = useIsMutating({ mutationKey: ["activationPatching"] }) > 0;

    if (isMobile === undefined) return null;

    if (isMobile) {
        return (
            <div className="size-full flex flex-col min-h-0 overflow-auto p-2 pb-20 gap-2">
                <MobileCollapsibleControls label="Activation Patching" icon={GitBranch} isRunning={isRunning}>
                    <ActivationPatchingArea />
                </MobileCollapsibleControls>
                <div className="rounded dark:bg-secondary/50 bg-secondary/80 border min-h-[50vh] flex-1">
                    <ActivationPatchingDisplay />
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
                    <ResizablePanel className="h-full" defaultSize={30} minSize={25}>
                        <ActivationPatchingArea />
                    </ResizablePanel>
                    <ResizableHandle className="w-[0.8px]" />
                    <ResizablePanel defaultSize={70} minSize={40}>
                        <ActivationPatchingDisplay />
                    </ResizablePanel>
                </ResizablePanelGroup>
            </div>
        </div>
    );
}
