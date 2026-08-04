"use client";

import { useParams } from "next/navigation";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import ChartCardsSidebar from "../../components/ChartCardsSidebar";
import JLensArea from "./components/JLensArea";
import { JLensDisplay } from "./components/JLensDisplay";
import { useIsMobile } from "@/hooks/useIsMobile";
import { MobileSidebarDrawer } from "../../components/MobileSidebarDrawer";
import { MobileCollapsibleControls } from "../../components/MobileCollapsibleControls";
import { ModelDeployingPanel } from "../../components/ModelDeployingPanel";
import { useChartModelReady } from "@/hooks/useChartModelReady";
import { JLensIcon } from "@/components/JLensIcon";
import { useIsMutating } from "@tanstack/react-query";

export default function JLensChartPage() {
    const isMobile = useIsMobile();
    const isRunning = useIsMutating({ mutationKey: ["jlens"] }) > 0;
    const { chartId } = useParams<{ chartId: string }>();
    const readiness = useChartModelReady(chartId);

    if (isMobile === undefined) return null;

    // Model not yet deployed AND no saved result → show the deploying panel in
    // place of the controls/visualization. The chart sidebar (desktop) and
    // drawer (mobile) stay mounted so the user can navigate to other charts
    // while this model deploys.
    const deploying = readiness.state === "deploying";

    if (isMobile) {
        return (
            <div className="size-full flex flex-col min-h-0 overflow-auto p-2 pb-20 gap-2">
                {deploying ? (
                    <div className="rounded dark:bg-secondary/50 bg-secondary/80 border min-h-[50vh] flex-1">
                        <ModelDeployingPanel
                            modelName={readiness.modelName}
                            phase={readiness.phase}
                        />
                    </div>
                ) : (
                    <>
                        <MobileCollapsibleControls
                            label="J-Lens"
                            icon={JLensIcon}
                            isRunning={isRunning}
                        >
                            <JLensArea />
                        </MobileCollapsibleControls>
                        <div className="rounded dark:bg-secondary/50 bg-secondary/80 border min-h-[50vh] flex-1">
                            <JLensDisplay />
                        </div>
                    </>
                )}
                <MobileSidebarDrawer />
            </div>
        );
    }

    return (
        <div className="size-full flex min-h-0">
            <ChartCardsSidebar />
            <div className="flex-1 min-h-0 pb-3 pr-3">
                {deploying ? (
                    <div className="size-full rounded dark:bg-secondary/50 bg-secondary/80 border">
                        <ModelDeployingPanel
                            modelName={readiness.modelName}
                            phase={readiness.phase}
                        />
                    </div>
                ) : (
                    <ResizablePanelGroup
                        direction="horizontal"
                        className="flex size-full rounded dark:bg-secondary/50 bg-secondary/80 border"
                    >
                        <ResizablePanel className="h-full" defaultSize={25} minSize={20}>
                            <JLensArea />
                        </ResizablePanel>
                        <ResizableHandle className="w-[0.8px]" />
                        <ResizablePanel defaultSize={75} minSize={40}>
                            <JLensDisplay />
                        </ResizablePanel>
                    </ResizablePanelGroup>
                )}
            </div>
        </div>
    );
}
