"use client";

import { useMemo } from "react";
import { ResponsiveLine } from "@nivo/line";

import { lineTheme, lineColors } from "@/components/charts/theming";
import { resolveThemeCssVars } from "@/lib/utils";
import type { DayBucket } from "@/lib/queries/workshopAnalyticsDb";

/**
 * Joins/day + runs/day for a workshop. A lean ResponsiveLine that reuses the
 * app's shared line theme + palette (theme-agnostic via resolveThemeCssVars);
 * the lens Line.tsx is too specialized (metric scales, canvas overlays) to reuse
 * directly.
 */
export function AnalyticsTimeSeries({
    joinsPerDay,
    runsPerDay,
}: {
    joinsPerDay: DayBucket[];
    runsPerDay: DayBucket[];
}) {
    const resolvedTheme = useMemo(() => resolveThemeCssVars(lineTheme), []);

    const series = useMemo(
        () => [
            { id: "Joins", data: joinsPerDay.map((d) => ({ x: d.date, y: d.count })) },
            { id: "Runs", data: runsPerDay.map((d) => ({ x: d.date, y: d.count })) },
        ],
        [joinsPerDay, runsPerDay],
    );

    const hasData = joinsPerDay.length > 0 || runsPerDay.length > 0;

    return (
        <div className="rounded-md border bg-card p-4 shadow-xs">
            <h3 className="text-sm font-medium">Activity over time</h3>
            <div className="h-64">
                {hasData ? (
                    <ResponsiveLine
                        data={series}
                        margin={{ top: 20, right: 24, bottom: 50, left: 40 }}
                        xScale={{ type: "point" }}
                        yScale={{ type: "linear", min: 0, max: "auto", stacked: false }}
                        theme={resolvedTheme}
                        colors={(s: { id: string | number }) =>
                            s.id === "Joins" ? lineColors[1] : lineColors[2]
                        }
                        axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -35 }}
                        axisLeft={{ tickSize: 0, tickPadding: 8, tickValues: 5, format: ">-.0f" }}
                        enableGridX={false}
                        pointSize={6}
                        pointBorderWidth={0}
                        useMesh
                        enableSlices="x"
                        legends={[
                            {
                                anchor: "top-right",
                                direction: "row",
                                translateY: -20,
                                itemWidth: 60,
                                itemHeight: 12,
                                symbolShape: "circle",
                                symbolSize: 8,
                            },
                        ]}
                    />
                ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        No activity yet.
                    </div>
                )}
            </div>
        </div>
    );
}
