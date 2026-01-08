"use client";

import { useLensWorkspace } from "@/stores/useLensWorkspace";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Table2, LineChart } from "lucide-react";

export function DisplayControls() {
    const {
        widgetRef,
        showHeatmap,
        setShowHeatmap,
        showChart,
        setShowChart,
        trajectoryMetric,
        setTrajectoryMetric,
        hasRankData,
    } = useLensWorkspace();

    // If no widget is available, don't show controls
    if (!widgetRef) {
        return null;
    }

    const rankAvailable = hasRankData();

    return (
        <div className="flex flex-col gap-3 w-full">
            {/* Show/Hide Controls */}
            <div className="flex flex-col gap-1.5">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="text-xs text-muted-foreground">Display</span>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                        Toggle which parts of the visualization to show.
                    </TooltipContent>
                </Tooltip>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowHeatmap(!showHeatmap)}
                        className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded border transition-colors ${
                            showHeatmap
                                ? "bg-primary/10 border-primary/30 text-foreground"
                                : "bg-muted/30 border-muted text-muted-foreground"
                        }`}
                    >
                        <Table2 className="w-3 h-3" />
                        Heatmap
                    </button>
                    <button
                        onClick={() => setShowChart(!showChart)}
                        className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded border transition-colors ${
                            showChart
                                ? "bg-primary/10 border-primary/30 text-foreground"
                                : "bg-muted/30 border-muted text-muted-foreground"
                        }`}
                    >
                        <LineChart className="w-3 h-3" />
                        Line Chart
                    </button>
                </div>
            </div>

            {/* Metric Mode Toggle */}
            {showChart && (
                <div className="flex flex-col gap-1.5">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="text-xs text-muted-foreground">Trajectory Metric</span>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                            Choose whether to show probability or rank trajectories.
                        </TooltipContent>
                    </Tooltip>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setTrajectoryMetric("prob")}
                            className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded border transition-colors ${
                                trajectoryMetric === "prob"
                                    ? "bg-primary/10 border-primary/30 text-foreground"
                                    : "bg-muted/30 border-muted text-muted-foreground"
                            }`}
                        >
                            Probability
                        </button>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={() => rankAvailable && setTrajectoryMetric("rank")}
                                    disabled={!rankAvailable}
                                    className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded border transition-colors ${
                                        trajectoryMetric === "rank"
                                            ? "bg-primary/10 border-primary/30 text-foreground"
                                            : "bg-muted/30 border-muted text-muted-foreground"
                                    } ${!rankAvailable && "opacity-50 cursor-not-allowed"}`}
                                >
                                    Rank
                                </button>
                            </TooltipTrigger>
                            {!rankAvailable && (
                                <TooltipContent side="right">
                                    Rank data is not available for this query.
                                </TooltipContent>
                            )}
                        </Tooltip>
                    </div>
                </div>
            )}
        </div>
    );
}
