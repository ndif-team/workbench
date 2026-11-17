"use client";

import { useParams } from "next/navigation";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import ActivationPatchingArea from "./components/ActivationPatchingArea";
import { ActivationPatchingDisplay } from "./components/ActivationPatchingDisplay";
import { useIsMobile } from "@/hooks/useIsMobile";
import { FloatingToolComposer } from "../../components/FloatingToolComposer";
import { ModelDeployingPanel } from "../../components/ModelDeployingPanel";
import { useChartModelReady } from "@/hooks/useChartModelReady";
import { cn } from "@/lib/utils";

export default function ActivationPatchingPage() {
    const isMobile = useIsMobile();
    const { chartId } = useParams<{ chartId: string }>();
    const readiness = useChartModelReady(chartId);

    if (isMobile === undefined) return null;

    // Deploying (no saved result) → show the panel in place of controls/viz;
    // sidebar/drawer stay mounted so other charts remain navigable.
    const deploying = readiness.state === "deploying";

    // On a phone the chart has the page; its controls are fixed to the bottom.
    if (isMobile) {
        return (
            <div
                className={cn(
                    "size-full flex flex-col min-h-0 overflow-auto p-2 pt-0 gap-2",
                    !deploying && FloatingToolComposer.PAGE_SPACE,
                )}
            >
                {deploying ? (
                    <div className="rounded dark:bg-secondary/50 bg-secondary/80 border min-h-[50vh] flex-1">
                        <ModelDeployingPanel
                            modelName={readiness.modelName}
                            phase={readiness.phase}
                        />
                    </div>
                ) : (
                    <>
                        <div className="rounded dark:bg-secondary/50 bg-secondary/80 border min-h-[50vh] flex-1">
                            <ActivationPatchingDisplay />
                        </div>
                        <ActivationPatchingArea layout="floating" />
                    </>
                )}
            </div>
        );
    }

    return (
        <div className="size-full flex min-h-0">
            <div className="flex-1 min-h-0 pb-3 px-3">
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
                        <ResizablePanel className="h-full" defaultSize={30} minSize={25}>
                            <ActivationPatchingArea />
                        </ResizablePanel>
                        <ResizableHandle className="w-[0.8px]" />
                        <ResizablePanel defaultSize={70} minSize={40}>
                            <ActivationPatchingDisplay />
                        </ResizablePanel>
                    </ResizablePanelGroup>
                )}
            </div>
        </div>
    );
}
