import { useEffect } from "react";
import { useHeatmapCanvas } from "./HeatmapCanvasProvider";
import { HeatmapViewData } from "@/types/charts";
import { useHeatmapView } from "../ViewProvider";

export const useAnnotationSelection = () => {
    const { setActiveSelection } = useHeatmapCanvas();
    const { view, isViewSuccess } = useHeatmapView();

    // Initialize active selection/annotation from saved view
    useEffect(() => {
        if (isViewSuccess && view) {
            const data = view.data as HeatmapViewData;
            if (data && data.annotation) {
                setActiveSelection(data.annotation);
            }
        }
    }, [isViewSuccess, view, setActiveSelection]);
};
