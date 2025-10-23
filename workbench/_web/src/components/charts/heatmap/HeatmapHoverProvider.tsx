import React, { createContext, useCallback, useContext, useState } from "react";
import { useHeatmapCanvas } from "./HeatmapCanvasProvider";

interface HeatmapHoverContextValue {
    handleMouseMove: (e: React.MouseEvent) => void;
    handleMouseLeave: () => void;
    hoverX: number | null;
    hoverY: number | null;
}

const HeatmapHoverContext = createContext<HeatmapHoverContextValue | null>(null);

export const useHeatmapHover = () => {
    const ctx = useContext(HeatmapHoverContext);
    if (!ctx) throw new Error("useHeatmapHover must be used within a HeatmapHoverProvider");
    return ctx;
};

export const HeatmapHoverProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { heatmapCanvasRef } = useHeatmapCanvas();

    const [hoverX, setHoverX] = useState<number | null>(null);
    const [hoverY, setHoverY] = useState<number | null>(null);

    const handleMouseMove = useCallback(
        (e: React.MouseEvent) => {
            const rect = heatmapCanvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            setHoverX(x);
            setHoverY(y);
        },
        [heatmapCanvasRef],
    );

    const handleMouseLeave = useCallback(() => {
        setHoverX(null);
        setHoverY(null);
    }, []);

    const value: HeatmapHoverContextValue = {
        handleMouseMove,
        handleMouseLeave,
        hoverX,
        hoverY,
    };

    return <HeatmapHoverContext.Provider value={value}>{children}</HeatmapHoverContext.Provider>;
};
