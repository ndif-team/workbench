import { useCallback } from "react";
import { useLineData } from "./LineDataProvider";
import { useLineCanvas } from "./LineCanvasProvider";
import { useLensWorkspace } from "@/stores/useLensWorkspace";
import { lineMargin as margin } from "../theming";

export const useLineClick = () => {
    const { lineCanvasRef, getNearestX } = useLineCanvas();
    const { lines, yRange } = useLineData();
    const { toggleLineHighlight } = useLensWorkspace();

    const handleClick = useCallback(
        (e: React.MouseEvent) => {
            const rect = lineCanvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const xRaw = e.clientX - rect.left;
            const yRaw = e.clientY - rect.top;
            const snappedXVal = getNearestX(xRaw);
            const canvas = lineCanvasRef.current;
            if (!canvas || snappedXVal == null) return;
            const innerHeight = Math.max(1, canvas.clientHeight - margin.top - margin.bottom);
            const curY = yRange as readonly [number, number];
            const mouseYData =
                curY[0] + (1 - (yRaw - margin.top) / innerHeight) * (curY[1] - curY[0]);
            let bestId: string | null = null;
            let bestDist = Number.POSITIVE_INFINITY;
            for (const line of lines) {
                const p = line.data.find((pt) => pt.x === snappedXVal);
                if (!p) continue;
                const dy = Math.abs(p.y - mouseYData);
                if (dy < bestDist) {
                    bestDist = dy;
                    bestId = String(line.id);
                }
            }
            if (bestId) toggleLineHighlight(bestId);
        },
        [lineCanvasRef, getNearestX, yRange, lines, toggleLineHighlight],
    );

    return { handleClick };
};
