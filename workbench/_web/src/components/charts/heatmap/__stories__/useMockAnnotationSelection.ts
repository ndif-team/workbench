"use client";

import { useEffect } from "react";
import { useHeatmapCanvas } from "./MockHeatmapCanvasProvider";
import { useHeatmapView, MockHeatmapView } from "./MockViewProvider";
import { HeatmapViewData } from "@/types/charts";

/**
 * Mock version of useAnnotationSelection for Storybook
 * Uses MockViewProvider instead of real backend
 */
export const useMockAnnotationSelection = () => {
    const { setActiveSelection } = useHeatmapCanvas();
    const { view, isViewSuccess } = useHeatmapView();

    useEffect(() => {
        if (isViewSuccess && view) {
            const hv = view as MockHeatmapView;
            const viewData = hv.data as HeatmapViewData;
            if (viewData?.annotation) {
                setActiveSelection(viewData.annotation);
            }
        }
    }, [view, isViewSuccess, setActiveSelection]);
};

// Also export as useAnnotationSelection for compatibility
export const useAnnotationSelection = useMockAnnotationSelection;
