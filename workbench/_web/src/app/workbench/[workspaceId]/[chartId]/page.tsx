"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from "@/components/ui/resizable";

import useModels from "@/hooks/useModels";
import ChartCardsSidebar from "../components/ChartCardsSidebar";
import LensArea from "./components/lens/LensArea";
import SimplePatchArea from "./components/patch/SimplePatchArea";
import { ChartDisplay } from "@/components/charts/ChartDisplay";
import { getConfigForChart } from "@/lib/queries/chartQueries";
import { Loader2, Search, ReplaceAll, X } from "lucide-react";
import { queryKeys } from "@/lib/queryKeys";


const tools = [
    { name: "Lens", key: "lens", icon: <Search className="h-4 w-4" /> },
    { name: "Patch", key: "patch", icon: <ReplaceAll className="h-4 w-4" /> },
];


export default function ChartPage() {
    const { chartId } = useParams<{ workspaceId: string; chartId: string }>();

    // Ensure a selected model exists
    useModels();

    const { data: config, isLoading: isConfigLoading } = useQuery({
        queryKey: queryKeys.charts.config(chartId as string),
        queryFn: () => getConfigForChart(chartId as string),
        enabled: !!chartId,
    });

    const isLens = config?.type === "lens";

    const activeTool = tools.find(t => t.key === config?.type);

    return (
        <div className="flex flex-1 min-h-0">
            <ResizablePanelGroup
                direction="horizontal"
                className="flex flex-1 min-h-0 h-full"
            >
                <ResizablePanel className="h-full" defaultSize={20} minSize={10}>
                    <ChartCardsSidebar />
                </ResizablePanel>
                <ResizableHandle className="w-[0.8px]" />
                <ResizablePanel className="h-full" defaultSize={30} minSize={25}>
                    <div className="flex items-center justify-between border-b h-12 px-2 py-2">
                        <div className="relative group">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded transition-colors bg-muted text-foreground">
                                {activeTool?.icon}
                                {activeTool?.name || ""}
                            </div>
                        </div>
                    </div>
                    {
                        isConfigLoading ?
                            <div className="flex flex-1 items-center p-4 justify-center">
                                <Loader2 className="w-4 h-4 animate-spin" />
                            </div> :
                            isLens ? <LensArea /> : <SimplePatchArea />
                    }
                </ResizablePanel>
                <ResizableHandle className="w-[0.8px]" />
                <ResizablePanel defaultSize={50} minSize={30}>
                    <ChartDisplay />
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    );
}