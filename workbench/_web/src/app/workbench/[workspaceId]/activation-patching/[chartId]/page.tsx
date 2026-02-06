"use client";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import ChartCardsSidebar from "../../components/ChartCardsSidebar";
import ActivationPatchingArea from "./components/ActivationPatchingArea";
import { ActivationPatchingDisplay } from "./components/ActivationPatchingDisplay";

export default function ActivationPatchingPage() {
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
