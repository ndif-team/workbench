"use client";

import {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useState,
} from "react";
import { ChartType, ChartView, HeatmapViewData, LineViewData } from "@/types/charts";

/**
 * Mock View type for Storybook (avoids db schema dependency)
 */
export interface MockView {
    id: string;
    chartId: string;
    data: ChartView;
    createdAt: Date;
    updatedAt: Date;
}

export type MockHeatmapView = Omit<MockView, "data"> & {
    data: HeatmapViewData;
};

export type MockLineView = Omit<MockView, "data"> & {
    data: LineViewData;
};

interface ViewContextValue {
    view: MockView | null;
    chartType: ChartType | null;
    isViewSuccess: boolean;
    cancelPersistView: () => void;
    persistView: (viewData: Partial<ChartView>) => void;
    clearView: () => Promise<void>;
}

const MockViewContext = createContext<ViewContextValue | null>(null);

export const useHeatmapView = () => {
    const ctx = useContext(MockViewContext);
    if (!ctx) throw new Error("useHeatmapView must be used within a MockViewProvider");
    return { ...ctx, view: ctx.view as MockHeatmapView | null };
};

export const useLineView = () => {
    const ctx = useContext(MockViewContext);
    if (!ctx) throw new Error("useLineView must be used within a MockViewProvider");
    return { ...ctx, view: ctx.view as MockLineView | null };
};

interface MockViewProviderProps {
    chartId: string;
    chartType?: ChartType;
    initialViewData?: Partial<HeatmapViewData | LineViewData>;
    children: ReactNode;
}

/**
 * Mock ViewProvider for Storybook that stores view state locally
 * without requiring backend API calls
 */
export const MockViewProvider = ({
    chartId,
    chartType = "heatmap",
    initialViewData,
    children,
}: MockViewProviderProps) => {
    const [viewData, setViewData] = useState<ChartView | null>(
        initialViewData ? (initialViewData as ChartView) : null
    );

    const view: MockView | null = viewData
        ? {
              id: `mock-view-${chartId}`,
              chartId,
              data: viewData,
              createdAt: new Date(),
              updatedAt: new Date(),
          }
        : null;

    const persistView = useCallback(
        (newViewData: Partial<ChartView>) => {
            setViewData((prev) => {
                const merged = { ...(prev ?? {}), ...newViewData } as ChartView;
                console.log("[MockViewProvider] Persisting view:", merged);
                return merged;
            });
        },
        []
    );

    const cancelPersistView = useCallback(() => {
        console.log("[MockViewProvider] Cancel persist called");
    }, []);

    const clearView = useCallback(async () => {
        console.log("[MockViewProvider] Clear view called");
        setViewData(null);
    }, []);

    const contextValue: ViewContextValue = {
        view,
        chartType,
        isViewSuccess: true,
        cancelPersistView,
        persistView,
        clearView,
    };

    return (
        <MockViewContext.Provider value={contextValue}>
            {children}
        </MockViewContext.Provider>
    );
};

export default MockViewProvider;
