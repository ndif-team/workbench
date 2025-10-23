import React, {
    createContext,
    useCallback,
    useContext,
    useRef,
    ReactNode,
    useState,
    useEffect,
} from "react";
import { lineMargin as margin } from "../theming";
import { useDpr } from "../useDpr";
import { SelectionBounds } from "@/types/charts";
import { useLineData } from "./LineDataProvider";
import { clear, drawRectData, drawRectPx } from "./draw";

interface LineCanvasContextValue {
    lineCanvasRef: React.RefObject<HTMLCanvasElement>;
    rafRef: React.MutableRefObject<number | null>;
    getNearestX: (px: number, returnPixelValue?: boolean) => number;
    activeSelection: SelectionBounds | null;
    setActiveSelection: (selection: SelectionBounds | null) => void;
}

const LineCanvasContext = createContext<LineCanvasContextValue | null>(null);

export const useLineCanvas = () => {
    const context = useContext(LineCanvasContext);
    if (!context) {
        throw new Error("useLineCanvas must be used within a LineCanvasProvider");
    }
    return context;
};

interface LineCanvasProviderProps {
    children: ReactNode;
}

export const LineCanvasProvider: React.FC<LineCanvasProviderProps> = ({ children }) => {
    const lineCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const rafRef = useRef<number | null>(null);
    const [activeSelection, setActiveSelection] = useState<SelectionBounds | null>(null);
    const activeSelectionRef = useRef<SelectionBounds | null>(null);

    // Keep ref in sync with state for use in callbacks
    activeSelectionRef.current = activeSelection;

    const { xRange, yRange, uniqueSortedX } = useLineData();

    const handleResize = useCallback(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            if (activeSelectionRef.current) {
                drawRectData(lineCanvasRef, activeSelectionRef.current, xRange, yRange);
            } else {
                clear(lineCanvasRef);
            }
        });
    }, [xRange, yRange, lineCanvasRef]);

    // DPR + resize handling
    useDpr(lineCanvasRef, handleResize);

    const getNearestX = useCallback(
        (px: number, returnPixelValue: boolean = false): number => {
            const canvas = lineCanvasRef.current;
            if (!canvas || uniqueSortedX.length === 0) return px;
            const innerWidth = Math.max(1, canvas.clientWidth - margin.left - margin.right);
            const xDomainMin = xRange[0];
            const xDomainMax = xRange[1];
            const domainSpan = Math.max(1e-9, xDomainMax - xDomainMin);
            const xVal = xDomainMin + ((px - margin.left) / innerWidth) * domainSpan;

            let nearest = uniqueSortedX[0];
            let bestDist = Math.abs(xVal - nearest);
            for (let i = 1; i < uniqueSortedX.length; i++) {
                const v = uniqueSortedX[i];
                const d = Math.abs(xVal - v);
                if (d < bestDist) {
                    nearest = v;
                    bestDist = d;
                }
            }

            if (!returnPixelValue) return nearest;
            const snappedPx = margin.left + ((nearest - xDomainMin) / domainSpan) * innerWidth;
            return snappedPx;
        },
        [xRange, lineCanvasRef, uniqueSortedX],
    );

    // Draw the selection rectangle
    useEffect(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            if (activeSelection) {
                drawRectData(lineCanvasRef, activeSelection, xRange, yRange);
            } else {
                clear(lineCanvasRef);
            }
        });
    }, [activeSelection, rafRef, lineCanvasRef, xRange, yRange]);

    const contextValue: LineCanvasContextValue = {
        lineCanvasRef,
        rafRef,
        getNearestX,
        activeSelection,
        setActiveSelection,
    };

    return <LineCanvasContext.Provider value={contextValue}>{children}</LineCanvasContext.Provider>;
};
