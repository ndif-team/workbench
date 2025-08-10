"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePatch } from "./PatchProvider";

function bezierPath(x1: number, y1: number, x2: number, y2: number) {
    const dx = Math.max(30, Math.abs(x2 - x1) * 0.3);
    const c1x = x1 + dx;
    const c1y = y1;
    const c2x = x2 - dx;
    const c2y = y2;
    return `M ${x1},${y1} C ${c1x},${c1y} ${c2x},${c2y} ${x2},${y2}`;
}

export default function ConnectionsOverlay({ containerRef }: { containerRef: React.RefObject<HTMLDivElement> }) {
    const { connections, pendingConnect, isConnectMode } = usePatch();
    const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);

    useEffect(() => {
        if (!isConnectMode || !pendingConnect) {
            setMouse(null);
            return;
        }
        const onMove = (e: MouseEvent) => {
            const cont = containerRef.current;
            if (!cont) return;
            const rect = cont.getBoundingClientRect();
            setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        };
        window.addEventListener("mousemove", onMove);
        return () => window.removeEventListener("mousemove", onMove);
    }, [isConnectMode, pendingConnect, containerRef]);

    const getCenter = (side: "source" | "destination", idx: number) => {
        const cont = containerRef.current;
        if (!cont) return null;
        const el = cont.querySelector(`[data-side="${side}"][data-token-id="${idx}"]`) as HTMLElement | null;
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const crect = cont.getBoundingClientRect();
        return { x: rect.left - crect.left + rect.width / 2, y: rect.top - crect.top + rect.height / 2 };
    };

    const paths = useMemo(() => {
        const list: { d: string }[] = [];
        for (const c of connections) {
            const a = getCenter("source", c.sourceIdx);
            const b = getCenter("destination", c.destIdx);
            if (!a || !b) continue;
            list.push({ d: bezierPath(a.x, a.y, b.x, b.y) });
        }
        return list;
    }, [connections]);

    const pendingPath = useMemo(() => {
        if (!isConnectMode || !pendingConnect || !mouse) return null;
        const a = getCenter(pendingConnect.side, pendingConnect.idx);
        if (!a) return null;
        return { d: bezierPath(a.x, a.y, mouse.x, mouse.y) };
    }, [isConnectMode, pendingConnect, mouse]);

    if (!containerRef.current) return null;

    return (
        <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%">
            <g fill="none" strokeWidth={2}>
                {paths.map((p, idx) => (
                    <path key={`conn-${idx}`} d={p.d} stroke="rgba(59,130,246,0.8)" />
                ))}
                {pendingPath && <path d={pendingPath.d} stroke="rgba(59,130,246,0.6)" strokeDasharray="6 4" />}
            </g>
        </svg>
    );
}