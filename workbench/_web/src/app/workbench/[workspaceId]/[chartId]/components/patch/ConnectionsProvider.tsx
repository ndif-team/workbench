"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";

interface Connection {
    sourceIdx: number;
    destIdx: number;
}

type Side = "source" | "destination";

interface DragState {
    isDragging: boolean;
    startSide: Side | null;
    startIdx: number | null;
    hoverIdx: number | null; // hovered index on the opposite side while dragging
    mousePos: { x: number; y: number } | null; // relative to provider container
}

interface ConnectionsState {
    connections: Connection[];
    drag: DragState;
}

interface ConnectionsActions {
    setConnections: (connections: Connection[]) => void;
    startConnection: (side: Side, idx: number) => void;
    enterToken: (side: Side, idx: number) => void;
    endConnection: (side: Side, idx: number) => void;
    cancelConnection: () => void;
    clearHover: () => void;
}

const ConnectionsContext = createContext<(ConnectionsState & ConnectionsActions) | null>(null);

export function useConnections(): ConnectionsState & ConnectionsActions {
    const ctx = useContext(ConnectionsContext);
    if (!ctx) throw new Error("useConnections must be used within ConnectionsProvider");
    return ctx;
}

function createStepPath(start: { x: number; y: number }, end: { x: number; y: number }): string {
    const midY = (start.y + end.y) / 2;
    const c1 = { x: start.x, y: midY };
    const c2 = { x: end.x, y: midY };
    return `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
}

export default function ConnectionsProvider({ children }: { children: React.ReactNode }) {
    const [connections, setConnections] = useState<Connection[]>([]);
    const [drag, setDrag] = useState<DragState>({
        isDragging: false,
        startSide: null,
        startIdx: null,
        hoverIdx: null,
        mousePos: null,
    });

    const containerRef = useRef<HTMLDivElement>(null);
    // refreshTick forces a re-render so overlay paths recompute geometry when
    // layout changes outside React (e.g., window resize or scroll). We don't
    // read the value; incrementing it triggers React to re-render.
    const [refreshTick, setRefreshTick] = useState(0);

    useEffect(() => {
        const handle = () => setRefreshTick((t) => t + 1);
        window.addEventListener("resize", handle);
        window.addEventListener("scroll", handle, true);
        return () => {
            window.removeEventListener("resize", handle);
            window.removeEventListener("scroll", handle, true);
        };
    }, []);

    const startConnection = (side: Side, idx: number) => {
        if (side !== "source") return;
        setDrag({
            isDragging: true,
            startSide: side,
            startIdx: idx,
            hoverIdx: null,
            mousePos: null,
        });
    };

    const enterToken = (side: Side, idx: number) => {
        setDrag((prev) => {
            if (!prev.isDragging || prev.startSide === side) return prev;
            return { ...prev, hoverIdx: idx };
        });
    };

    const endConnection = (side: Side, idx: number) => {
        setDrag((prev) => {
            if (!prev.isDragging || prev.startSide === side || prev.startIdx === null) {
                return {
                    isDragging: false,
                    startSide: null,
                    startIdx: null,
                    hoverIdx: null,
                    mousePos: null,
                };
            }
            if (prev.startSide !== "source" || side !== "destination") {
                return {
                    isDragging: false,
                    startSide: null,
                    startIdx: null,
                    hoverIdx: null,
                    mousePos: null,
                };
            }
            const sourceIdx = prev.startIdx;
            const destIdx = idx;
            setConnections((curr) => {
                const exists = curr.some((c) => c.sourceIdx === sourceIdx && c.destIdx === destIdx);
                if (exists) return curr;
                return [...curr, { sourceIdx, destIdx }];
            });
            return {
                isDragging: false,
                startSide: null,
                startIdx: null,
                hoverIdx: null,
                mousePos: null,
            };
        });
    };

    const cancelConnection = () => {
        setDrag({
            isDragging: false,
            startSide: null,
            startIdx: null,
            hoverIdx: null,
            mousePos: null,
        });
    };

    const clearHover = () => {
        setDrag((prev) => ({ ...prev, hoverIdx: null }));
    };

    const updateMouseFromEvent = (e: React.MouseEvent) => {
        if (!drag.isDragging) return;
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setDrag((prev) => ({ ...prev, mousePos: { x, y } }));
    };

    const getTokenCenter = (side: Side, index: number, at: "top" | "bottom") => {
        const container = containerRef.current;
        if (!container) return null;
        const token = container.querySelector<HTMLElement>(
            `[data-token-side="${side}"][data-token-id="${index}"]`,
        );
        if (!token) return null;
        const tokenRect = token.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const x = tokenRect.left + tokenRect.width / 2 - containerRect.left;
        const y = (at === "top" ? tokenRect.top : tokenRect.bottom) - containerRect.top;
        return { x, y };
    };

    const renderConnections = () => {
        return connections.map((c, i) => {
            const start = getTokenCenter("source", c.sourceIdx, "bottom");
            const end = getTokenCenter("destination", c.destIdx, "top");
            if (!start || !end) return null;
            return (
                <g key={i}>
                    <path
                        d={createStepPath(start, end)}
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth={1}
                        markerEnd="url(#arrowhead)"
                    />
                </g>
            );
        });
    };

    const renderDragging = () => {
        if (!drag.isDragging || drag.startSide !== "source" || drag.startIdx == null) return null;
        const start = getTokenCenter("source", drag.startIdx, "bottom");
        let end: { x: number; y: number } | null = null;
        if (drag.hoverIdx != null) {
            end = getTokenCenter("destination", drag.hoverIdx, "top");
        } else if (drag.mousePos) {
            end = drag.mousePos;
        }
        if (!start || !end) return null;
        return (
            <g>
                <path
                    d={createStepPath(start, end)}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth={1}
                    strokeDasharray="5,5"
                    markerEnd="url(#arrowhead)"
                />
            </g>
        );
    };

    const value = {
        connections,
        drag,
        setConnections,
        startConnection,
        enterToken,
        endConnection,
        cancelConnection,
        clearHover,
    };

    return (
        <ConnectionsContext.Provider value={value}>
            <div
                ref={containerRef}
                className="relative"
                onMouseMove={updateMouseFromEvent}
                onMouseUp={() => drag.isDragging && cancelConnection()}
                onMouseLeave={() => drag.isDragging && cancelConnection()}
            >
                {children}
                <svg className="pointer-events-none absolute inset-0 w-full h-full">
                    <defs>
                        <marker
                            id="arrowhead"
                            markerWidth="10"
                            markerHeight="7"
                            refX="9"
                            refY="3.5"
                            orient="auto"
                        >
                            <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
                        </marker>
                    </defs>
                    {renderConnections()}
                    {renderDragging()}
                </svg>
            </div>
        </ConnectionsContext.Provider>
    );
}
