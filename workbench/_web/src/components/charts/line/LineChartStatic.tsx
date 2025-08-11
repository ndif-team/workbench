"use client";

import type { LineGraphData } from "@/types/charts";
import { ResponsiveLine } from "@nivo/line";
import { lineTheme } from "../theming";

interface LineChartStaticProps {
    data: LineGraphData;
}

export default function LineChartStatic({ data }: LineChartStaticProps) {
    return (
        <div className="w-full h-[380px]">
            <ResponsiveLine
                data={data.lines}
                margin={{ top: 36, right: 24, bottom: 48, left: 60 }}
                yScale={{ type: 'linear', min: 0, max: 1, stacked: false, reverse: false }}
                axisBottom={{ legend: 'Layer', legendOffset: 35, tickSize: 0, tickPadding: 10 }}
                axisLeft={{ legend: 'Probability', legendOffset: -45, tickSize: 0, tickPadding: 10 }}
                useMesh={false}
                theme={lineTheme}
                colors={{ scheme: 'set1' }}
                enableGridX={false}
                animate={false}
                enablePoints={false}
                legends={[{ anchor: 'top', direction: 'row', translateY: -20, itemWidth: 60, itemHeight: 18, symbolSize: 6, symbolShape: 'square' }]}
                layers={[ 'grid', 'axes', 'legends' ]}
            />
        </div>
    );
}