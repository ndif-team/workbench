"use client";

import ChartCardsSidebar from "../../components/ChartCardsSidebar";
import { Editor } from "./components/Editor";
import { useIsMobile } from "@/hooks/useIsMobile";
import { MobileSidebarDrawer } from "../../components/MobileSidebarDrawer";

export default function OverviewPage() {
    const isMobile = useIsMobile();

    if (isMobile === undefined) return null;

    if (isMobile) {
        return (
            <div className="flex flex-col size-full min-h-0 overflow-auto p-2 pb-20">
                <div className="size-full border rounded dark:bg-secondary/60 bg-secondary/80 min-h-[80vh]">
                    <Editor />
                </div>
                <MobileSidebarDrawer />
            </div>
        );
    }

    return (
        <div className="flex size-full min-h-0">
            <div className="w-[20vw]">
                <ChartCardsSidebar />
            </div>
            <div className="pb-3 pr-3 w-[80vw] min-h-0">
                <div className="size-full border rounded dark:bg-secondary/60 bg-secondary/80">
                    <Editor />
                </div>
            </div>
        </div>
    );
}
