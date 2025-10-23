import { useLineData } from "./LineDataProvider";
import { lineColors } from "../theming";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { useLineHover } from "./LineHoverProvider";

export const Tooltip = () => {
    const { hoverSnappedXPx, hoverSnappedXValue, hoverYData } = useLineHover();
    const { lines, yRange } = useLineData();

    const nearestLineIdAtX = useMemo(() => {
        if (hoverSnappedXValue == null) return null;
        const yTarget = hoverYData ?? (yRange[0] + yRange[1]) / 2;
        let bestId: string | null = null;
        let bestDist = Number.POSITIVE_INFINITY;
        for (const line of lines) {
            const p = line.data.find((pt) => pt.x === hoverSnappedXValue);
            if (!p) continue;
            const dy = Math.abs(p.y - yTarget);
            if (dy < bestDist) {
                bestDist = dy;
                bestId = String(line.id);
            }
        }
        return bestId;
    }, [hoverSnappedXValue, hoverYData, lines, yRange]);

    if (hoverSnappedXPx == null) return null;

    return (
        <div
            className="absolute top-[5%] z-30 w-48 pointer-events-none"
            style={{ left: Math.max(0, hoverSnappedXPx - 155) }}
        >
            <div className="bg-background border text-xs rounded px-3 py-2 shadow-sm whitespace-nowrap">
                <div className="font-bold mb-1 text-foreground">
                    Layer {String(hoverSnappedXValue)}
                </div>
                {lines.map((line, index) => {
                    const p = line.data.find((pt) => pt.x === hoverSnappedXValue);
                    if (!p) return null;
                    const isNearest = nearestLineIdAtX && String(line.id) === nearestLineIdAtX;
                    const color = lineColors[index % lineColors.length];
                    return (
                        <div
                            key={String(line.id)}
                            className="flex items-center justify-between gap-3"
                        >
                            <div className="flex items-center gap-3">
                                <span
                                    className={cn(
                                        "w-3 h-1 rounded-full",
                                        isNearest ? "opacity-100" : "opacity-25",
                                    )}
                                    style={{ backgroundColor: color }}
                                />
                                <span
                                    className={cn(
                                        "truncate max-w-18",
                                        isNearest
                                            ? "font-bold text-foreground"
                                            : "text-muted-foreground",
                                    )}
                                    title={String(line.id)}
                                >
                                    {line.id}:
                                </span>
                            </div>
                            <span
                                className={cn(
                                    "font-mono",
                                    isNearest
                                        ? "font-bold text-foreground"
                                        : "text-muted-foreground",
                                )}
                            >
                                {p.y.toFixed(3)}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
