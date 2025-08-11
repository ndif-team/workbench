import { useState, useMemo, useEffect } from "react";
import { LineGraphData } from "@/types/charts";
import { Line } from "./Line";
import { RangeSelector } from "../RangeSelector";
import { useSetChartTitle } from "@/lib/api/chartApi";

type Range = [number, number];
type RangeWithId = {
    id: string;
    range: Range;
};

interface LineCardProps {
    data: LineGraphData
    chartId: string;
    initialTitle?: string;
}

export const LineCard = ({ data, chartId, initialTitle = "" }: LineCardProps) => {
    const [title, setTitle] = useState(initialTitle);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const { mutate: saveTitle } = useSetChartTitle();

    useEffect(() => {
        setTitle(initialTitle || "");
    }, [initialTitle]);

    const [xRanges, setXRanges] = useState<RangeWithId[]>([]);
    const [yRanges, setYRanges] = useState<RangeWithId[]>([]);
    
    // Extract single range from array format
    const xRange = xRanges.length > 0 ? xRanges[0].range : undefined;
    const yRange = yRanges.length > 0 ? yRanges[0].range : undefined;

    // Calculate the bounds from the data
    const bounds = useMemo(() => {
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        
        data.lines.forEach(line => {
            line.data.forEach(point => {
                minX = Math.min(minX, point.x);
                maxX = Math.max(maxX, point.x);
                minY = Math.min(minY, point.y);
                maxY = Math.max(maxY, point.y);
            });
        });
        
        return {
            xMin: minX === Infinity ? 0 : minX,
            xMax: maxX === -Infinity ? 100 : maxX,
            yMin: minY === Infinity ? 0 : minY,
            yMax: maxY === -Infinity ? 1 : maxY,
        };
    }, [data]);

    // Filter the data based on X range only
    const filteredData = useMemo(() => {
        if (!xRange) {
            return data;
        }

        const xMin = xRange[0];
        const xMax = xRange[1];

        return {
            ...data,
            lines: data.lines.map(line => ({
                ...line,
                data: line.data.filter(point => 
                    point.x >= xMin && point.x <= xMax
                )
            }))
        };
    }, [data, xRange]);

    const commitTitle = () => {
        setIsEditingTitle(false);
        if ((title || "").trim() !== (initialTitle || "").trim()) {
            saveTitle({ chartId, title: title.trim() });
        }
    };

    return (
        <div className="flex flex-col h-full m-2 border rounded bg-muted">
            <div className="flex h-[10%] gap-2 p-4 lg:p-8 justify-between">
                {isEditingTitle ? (
                    <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        onBlur={commitTitle}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                commitTitle();
                            }
                        }}
                        placeholder="Untitled Chart"
                        className="text-xl font-bold p-0 m-0 border-primary border overflow-clip rounded bg-transparent w-64"
                        autoFocus
                    />
                ) : (
                    <h1 
                        className="text-xl font-bold cursor-pointer border rounded border-transparent w-64 overflow-clip items-center flex hover:border-border transition-opacity p-0 m-0"
                        onClick={() => setIsEditingTitle(true)}
                    >
                        {title || "Untitled Chart"}
                    </h1>
                )}

                <div className="flex items-center gap-2">
                    <RangeSelector
                        min={bounds.xMin}
                        max={bounds.xMax}
                        ranges={xRanges}
                        onRangesChange={setXRanges}
                        maxRanges={1}
                        axisLabel="X Range"
                    />
                    
                    <RangeSelector
                        min={0}
                        max={1}
                        ranges={yRanges}
                        onRangesChange={setYRanges}
                        maxRanges={1}
                        axisLabel="Y Range"
                        step={0.01}
                    />
                </div>
            </div>
            <div className="flex h-[90%] w-full">
                <Line 
                    data={filteredData}
                    yRange={yRange}
                />
            </div>
        </div>
    )
}

