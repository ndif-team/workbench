"use client";

import { useParams } from "next/navigation";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import ChartCardsSidebar from "../../components/ChartCardsSidebar";
import ActivationPatchingArea from "./components/ActivationPatchingArea";
import { ActivationPatchingDisplay } from "./components/ActivationPatchingDisplay";
import { useIsMobile } from "@/hooks/useIsMobile";
import { MobileSidebarDrawer } from "../../components/MobileSidebarDrawer";
import { MobileCollapsibleControls } from "../../components/MobileCollapsibleControls";
import { ModelDeployingPanel } from "../../components/ModelDeployingPanel";
import { useChartModelReady } from "@/hooks/useChartModelReady";
import { GitBranch } from "lucide-react";
import { useIsMutating } from "@tanstack/react-query";
import { GenerationRail } from "../../components/generation/GenerationRail";
import { CollapsedRailButton } from "../../components/generation/CollapsedRailButton";
import { MobileGenerationDrawer } from "../../components/generation/MobileGenerationDrawer";
import { useGenerationPanel } from "@/stores/useGenerationPanel";
import { useWorkspace } from "@/stores/useWorkspace";
import { useQuery } from "@tanstack/react-query";
import { getModels } from "@/lib/api/modelsApi";

export default function ActivationPatchingPage() {
    const isMobile = useIsMobile();
    const isRunning = useIsMutating({ mutationKey: ["activationPatching"] }) > 0;
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

    // Deploying (no saved result) → show the panel in place of controls/viz;
    // sidebar/drawer stay mounted so other charts remain navigable.
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
                            label="Activation Patching"
                            icon={GitBranch}
                            isRunning={isRunning}
                        >
                            <ActivationPatchingArea />
                        </MobileCollapsibleControls>
                        <div className="rounded dark:bg-secondary/50 bg-secondary/80 border min-h-[50vh] flex-1">
                            <ActivationPatchingDisplay />
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
                        <ResizablePanel className="h-full" defaultSize={26} minSize={22}>
                            <ActivationPatchingArea />
                        </ResizablePanel>
                        <ResizableHandle className="w-[0.8px]" />
                        <ResizablePanel defaultSize={collapsed ? 70 : 52} minSize={32}>
                            <ActivationPatchingDisplay />
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
