"use client";

import {
    createContext,
    useContext,
    useState,
    useMemo,
    useEffect,
    ReactNode,
    useCallback,
} from "react";
import { HeatmapRow, HeatmapBounds, Range, HeatmapViewData } from "@/types/charts";
import { useHeatmapView, MockHeatmapView } from "./MockViewProvider";
import { MockHeatmapChart } from "./mockData";

interface HeatmapDataContextValue {
    // Range State
    xRange: Range;
    yRange: Range;
    setXRange: (range: Range) => void;
    setYRange: (range: Range) => void;
    setXStep: (step: number) => void;
    defaultXStep: number;
    xStep: number;
    handleStepChange: (e: React.ChangeEvent<HTMLInputElement>) => void;

    // Computed Values
    bounds: HeatmapBounds;
    filteredData: HeatmapRow[];
}

const MockHeatmapDataContext = createContext<HeatmapDataContextValue | null>(null);

export const useMockHeatmapData = () => {
    const context = useContext(MockHeatmapDataContext);
    if (!context) {
        throw new Error("useMockHeatmapData must be used within a MockHeatmapDataProvider");
    }
    return context;
};

// Also export as useHeatmapData for compatibility with existing hooks
export const useHeatmapData = useMockHeatmapData;

interface MockHeatmapDataProviderProps {
    chart: MockHeatmapChart;
    children: ReactNode;
}

/**
 * Mock version of HeatmapDataProvider for Storybook
 * Uses MockViewProvider context instead of real backend
 */
export const MockHeatmapDataProvider: React.FC<MockHeatmapDataProviderProps> = ({
    chart,
    children,
}) => {
    const rows = chart.data;
    const { view, isViewSuccess, persistView } = useHeatmapView();

    // Calculate bounds
    const bounds = useMemo(() => {
        const xMax = rows.length && rows[0].data.length ? rows[0].data.length - 1 : 100;
        const yMax = rows.length ? rows.length - 1 : 100;
        return {
            minRow: 0,
            maxRow: yMax,
            minCol: 0,
            maxCol: xMax,
        };
    }, [rows]);

    // Range State, default to full bounds
    const [xRange, setXRange] = useState<Range>([bounds.minCol, bounds.maxCol]);
    const [yRange, setYRange] = useState<Range>([bounds.minRow, bounds.maxRow]);

    // Calculate default step
    const defaultXStep = useMemo(() => {
        const width = bounds.maxCol - bounds.minCol;
        return Math.max(1, Math.floor(width / 10));
    }, [bounds.maxCol, bounds.minCol]);

    // Step State
    const [xStep, setXStep] = useState<number>(1);

    // Update the X step when there's new data
    useEffect(() => {
        setXStep(defaultXStep);
    }, [rows, defaultXStep]);

    // Update the Y range to the last 10 tokens when there's new data
    useEffect(() => {
        const start = Math.max(bounds.minRow, bounds.maxRow - 9);
        setYRange([start, bounds.maxRow]);
    }, [rows, bounds.minRow, bounds.maxRow]);

    // Load from stored view
    useEffect(() => {
        if (isViewSuccess && view) {
            const hv = view as MockHeatmapView;
            const viewData = hv.data as HeatmapViewData;
            const b = viewData?.bounds;
            if (b) {
                setXRange([b.minCol, b.maxCol]);
                setYRange([b.minRow, b.maxRow]);
            }
            if (viewData?.xStep) {
                setXStep(viewData.xStep);
            }
        }
    }, [view, isViewSuccess]);

    const handleStepChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const val = Number(e.target.value);
            if (Number.isNaN(val)) {
                setXStep(1);
            } else {
                const step = Math.max(1, Math.min(val, Math.max(1, bounds.maxCol - bounds.minCol)));
                setXStep(step);
                persistView({ xStep: step });
            }
        },
        [bounds.maxCol, bounds.minCol, persistView]
    );

    // Filter data based on ranges and stepping
    const filteredData = useMemo<HeatmapRow[]>(() => {
        const stride = Math.max(1, Math.floor(xStep));

        return rows
            .map((row, yIndex) => {
                // Check if this row index is within Y range
                const inYRange = yIndex >= yRange[0] && yIndex <= yRange[1];
                if (!inYRange) return null;

                // Apply X range filtering and stepping
                const filteredAndSampled = row.data
                    .map((cell, idx) => ({ cell, idx }))
                    .filter(({ idx }) => {
                        // First check if within X range
                        const inXRange = idx >= xRange[0] && idx <= xRange[1];
                        if (!inXRange) return false;
                        // Then apply stepping (take every Nth element)
                        const relativeIdx = idx - xRange[0];
                        return relativeIdx % stride === 0;
                    })
                    .map(({ cell }) => cell);

                return {
                    ...row,
                    data: filteredAndSampled,
                } as HeatmapRow;
            })
            .filter((row): row is HeatmapRow => row !== null);
    }, [rows, xRange, yRange, xStep]);

    const contextValue: HeatmapDataContextValue = {
        // Range State
        xRange,
        yRange,
        xStep,
        setXRange,
        setYRange,
        setXStep,
        defaultXStep,
        handleStepChange,

        // Computed Values
        bounds,
        filteredData,
    };

    return (
        <MockHeatmapDataContext.Provider value={contextValue}>
            {children}
        </MockHeatmapDataContext.Provider>
    );
};

export default MockHeatmapDataProvider;
