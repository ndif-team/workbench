"use client";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import ChartCardsSidebar from "../../components/ChartCardsSidebar";
import Lens2Area from "./components/Lens2Area";
import { Lens2Display } from "./components/Lens2Display";

export default function Lens2ChartPage() {
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
