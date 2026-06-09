"use client";

import { useParams } from "next/navigation";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import ChartCardsSidebar from "../../components/ChartCardsSidebar";
import Lens2Area from "./components/Lens2Area";
import { Lens2Display } from "./components/Lens2Display";
import { useIsMobile } from "@/hooks/useIsMobile";
import { MobileSidebarDrawer } from "../../components/MobileSidebarDrawer";
import { MobileCollapsibleControls } from "../../components/MobileCollapsibleControls";
import { ModelDeployingPanel } from "../../components/ModelDeployingPanel";
import { useChartModelReady } from "@/hooks/useChartModelReady";
import { Layers } from "lucide-react";
import { useIsMutating } from "@tanstack/react-query";
import { GenerationRail } from "../../components/generation/GenerationRail";
import { CollapsedRailButton } from "../../components/generation/CollapsedRailButton";
import { MobileGenerationDrawer } from "../../components/generation/MobileGenerationDrawer";
import { useGenerationPanel } from "@/stores/useGenerationPanel";
import { useWorkspace } from "@/stores/useWorkspace";
import { useQuery } from "@tanstack/react-query";
import { getModels } from "@/lib/api/modelsApi";

export default function Lens2ChartPage() {
    const isMobile = useIsMobile();
    const isRunning = useIsMutating({ mutationKey: ["lens2"] }) > 0;
    const collapsed = useGenerationPanel((s) => s.collapsed);
    const setCollapsed = useGenerationPanel((s) => s.setCollapsed);
    const buckets = useGenerationPanel((s) => s.buckets);
    const { workspaceId, chartId } = useParams<{ workspaceId: string; chartId: string }>();
    const { selectedModelIdx } = useWorkspace();
    const { data: models } = useQuery({ queryKey: ["models"], queryFn: getModels });
    const modelName = models?.[selectedModelIdx]?.name;
    const railCount =
        workspaceId && modelName ? (buckets[`${workspaceId}::${modelName}`]?.items.length ?? 0) : 0;
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
                            label="Logit Lens"
                            icon={Layers}
                            isRunning={isRunning}
                        >
                            <Lens2Area />
                        </MobileCollapsibleControls>
                        <div className="rounded dark:bg-secondary/50 bg-secondary/80 border min-h-[50vh] flex-1">
                            <Lens2Display />
                        </div>
                    </>
                )}
                <MobileSidebarDrawer />
                <MobileGenerationDrawer />
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
                        <ResizablePanel className="h-full" defaultSize={22} minSize={18}>
                            <Lens2Area />
                        </ResizablePanel>
                        <ResizableHandle className="w-[0.8px]" />
                        <ResizablePanel defaultSize={collapsed ? 75 : 56} minSize={32}>
                            <Lens2Display />
                        </ResizablePanel>
                        {collapsed ? (
                            <CollapsedRailButton
                                onExpand={() => setCollapsed(false)}
                                count={railCount}
                            />
                        ) : (
                            <>
                                <ResizableHandle className="w-[0.8px]" />
                                <ResizablePanel defaultSize={22} minSize={18} maxSize={40}>
                                    <GenerationRail onCollapse={() => setCollapsed(true)} />
                                </ResizablePanel>
                            </>
                        )}
                    </ResizablePanelGroup>
                )}
            </div>
        </div>
    );
}
