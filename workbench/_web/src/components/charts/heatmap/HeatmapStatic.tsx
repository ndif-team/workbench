"use client";

import { useMemo } from "react";
import type { HeatmapData } from "@/types/charts";
import { ResponsiveHeatMapCanvas } from "@nivo/heatmap";
import { heatmapTheme, heatmapMargin } from "../theming";
import { resolveThemeCssVars } from "@/lib/utils";

interface HeatmapStaticProps {
    data: HeatmapData;
}

export default function HeatmapStatic({ data }: HeatmapStaticProps) {
    const resolvedTheme = useMemo(() => resolveThemeCssVars(heatmapTheme), []);
    return (
        <div className="w-full h-[400px]">
            <ResponsiveHeatMapCanvas
                data={data.rows}
                margin={heatmapMargin}
                valueFormat=">-.2f"
                axisTop={null}
                axisBottom={{ legend: 'Layer', legendOffset: 40, tickSize: 0, tickPadding: 10, format: (v) => String(v) }}
                axisLeft={{ tickSize: 0, tickPadding: 10, format: (v) => String(v).replace(/-\d+$/, '') }}
                label={(cell) => cell.data.label || ''}
                labelTextColor={(cell) => {
                    const value = cell.data.y;
                    return value !== null && value > 0.5 ? '#ffffff' : '#000000';
                }}
                colors={{ type: 'sequential', scheme: 'blues', minValue: 0, maxValue: 1 }}
                hoverTarget="cell"
                inactiveOpacity={1}
                theme={resolvedTheme}
                animate={false}
                legends={[{ anchor: 'right', translateX: 30, length: 300, thickness: 8, direction: 'column', tickPosition: 'after', tickSize: 3, tickSpacing: 4, tickFormat: '>-.2f', titleAlign: 'start' }]}
            />
        </div>
    );
}