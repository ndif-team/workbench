import { useEffect } from "react";
import { useLineCanvas } from "./LineCanvasProvider";
import { LineViewData } from "@/types/charts";
import { useLineView } from "../ViewProvider";

export const useAnnotationSelection = () => {
    const { setActiveSelection } = useLineCanvas();
    const { view, isViewSuccess } = useLineView();

    // Initialize active selection/annotation from saved view
    useEffect(() => {
        if (isViewSuccess && view) {
            const data = view.data as LineViewData;
            if (data && data.annotation) {
                setActiveSelection(data.annotation);
            }
        }
    }, [isViewSuccess, view, setActiveSelection]);
};
