"use client";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

import ChartCardsSidebar from "../components/ChartCardsSidebar";
import LensArea from "./components/lens/LensArea";
import ConceptLensArea from "./components/conceptlens/ConceptLensArea";
// import SimplePatchArea from "./components/patch/SimplePatchArea";
import { ChartDisplay } from "@/components/charts/ChartDisplay";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getConfigForChart } from "@/lib/queries/chartQueries";
import { queryKeys } from "@/lib/queryKeys";
import { Config } from "@/db/schema";

export default function ChartPage() {
    const { chartId } = useParams<{ chartId: string }>();

    const { data: config } = useQuery({
        queryKey: queryKeys.charts.configByChart(chartId),
        queryFn: () => getConfigForChart(chartId),
        enabled: !!chartId,
    });

    const renderToolArea = () => {
        if (!config) {
            return (
                <div className="h-full flex items-center justify-center">
                    <div className="animate-pulse">Loading...</div>
                </div>
            );
        }

        const toolType = (config as Config).type;

        switch (toolType) {
            case "logit-lens":
            case "lens": // Backwards compatibility for old charts
                return <LensArea />;
            case "concept-lens":
                return <ConceptLensArea />;
            case "patch":
                // return <SimplePatchArea />;
                return <div>Patch tool coming soon</div>;
            default:
                return <div>Unknown tool type: {toolType}</div>;
        }
    };

    return (
        <div className="size-full flex min-h-0">
            <ChartCardsSidebar />
            <div className="flex-1 min-h-0 pb-3 pr-3">
                <ResizablePanelGroup
                    direction="horizontal"
                    className="flex size-full rounded dark:bg-secondary/50 bg-secondary/80 border"
                >
                    <ResizablePanel className="h-full" defaultSize={30} minSize={30}>
                        {renderToolArea()}
                    </ResizablePanel>
                    <ResizableHandle className="w-[0.8px]" />
                    <ResizablePanel defaultSize={50} minSize={30}>
                        <ChartDisplay />
                    </ResizablePanel>
                </ResizablePanelGroup>
            </div>
        </div>
    );
}
