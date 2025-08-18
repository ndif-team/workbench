import React, { createContext, useContext, useState, useMemo, ReactNode, useEffect } from "react";
import { LineChart } from "@/db/schema";
import { LineGraphData, Range, SelectionBounds } from "@/types/charts";
import { useLineView } from "../ViewProvider";

interface LineDataContextValue {
    // Range State
    data: LineGraphData;
    uniqueSortedX: number[];
    xRange: Range;
    yRange: Range;
    setXRange: (r: Range) => void;
    setYRange: (r: Range) => void;
    bounds: SelectionBounds;
}

const LineDataContext = createContext<LineDataContextValue | null>(null);

export const useLineData = () => {
    const context = useContext(LineDataContext);
    if (!context) {
        throw new Error("useLineData must be used within a LineDataProvider");
    }
    return context;
};

interface LineDataProviderProps {
    chart: LineChart;
    children: ReactNode;
}

export const LineDataProvider: React.FC<LineDataProviderProps> = ({ chart, children }) => {
    const { data:rawData } = chart;

    // Calculate the bounds from the data
    const bounds = useMemo(() => {
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        rawData.lines.forEach(line => {
            line.data.forEach(point => {
                minX = Math.min(minX, point.x);
                maxX = Math.max(maxX, point.x);
                minY = Math.min(minY, point.y);
                maxY = Math.max(maxY, point.y);
            });
        });

        return {
            xMin: minX === Infinity ? 0 : minX,
            xMax: maxX === -Infinity ? 12 : maxX,
            yMin: minY === Infinity ? 0 : minY,
            yMax: maxY === -Infinity ? 1 : maxY,
        } as SelectionBounds;
    }, [rawData]);

    const [xRange, setXRange] = useState<Range>([bounds.xMin, bounds.xMax]);
    const [yRange, setYRange] = useState<Range>([0, 1]);

    // Initialize ranges from saved view if present
    const { view, isViewSuccess } = useLineView();
    useEffect(() => {
        if (isViewSuccess && view) {
            const data = view.data as { bounds?: SelectionBounds } | undefined;
            if (data && data.bounds) {
                setXRange([data.bounds.xMin, data.bounds.xMax]);
                setYRange([data.bounds.yMin, data.bounds.yMax]);
            }
        }
    }, [isViewSuccess, view]);

    // Filter the data based on X range only
    // Y range truncates incorrectly ish
    const data = useMemo(() => {
        if (!xRange) {
            return rawData;
        }

        const xMin = xRange[0];
        const xMax = xRange[1];

        return {
            ...rawData,
            lines: rawData.lines.map(line => ({
                ...line,
                data: line.data.filter(point =>
                    point.x >= xMin && point.x <= xMax
                )
            }))
        };
    }, [rawData, xRange]);

    const uniqueSortedX = React.useMemo(() => {
        const set = new Set<number>();
        data.lines.forEach(line => {
            line.data.forEach(p => set.add(p.x));
        });
        return Array.from(set).sort((a, b) => a - b);
    }, [data]);

    const contextValue: LineDataContextValue = {
        data,
        uniqueSortedX,
        xRange,
        yRange,
        setXRange,
        setYRange,
        bounds,
    };

    return (
        <LineDataContext.Provider value={contextValue}>
            {children}
        </LineDataContext.Provider>
    );
};
