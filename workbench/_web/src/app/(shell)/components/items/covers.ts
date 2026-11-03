import type { CSSProperties } from "react";

/** The NDIF logo's colors in order around its wheel: orchid, violet, periwinkle, sky. */
const NDIF_COLORS = ["#B86BC6", "#9C7BD8", "#6E8BE6", "#33A8F5"] as const;

/** A number in [0, 1) from `id` (FNV-1a), so the same item always gets the same cover. */
function unit(id: string, salt: number): number {
    let hash = 2166136261 ^ salt;
    for (const ch of id) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
    return (hash >>> 0) / 0x100000000;
}

/** Where a `powder-cover` puts its three blobs, from the item's id. */
export function coverPlacement(id: string): CSSProperties {
    const spot = (salt: number) =>
        `${Math.round(10 + unit(id, salt) * 80)}% ${Math.round(5 + unit(id, salt + 7) * 90)}%`;
    return { "--cover-a": spot(1), "--cover-b": spot(2), "--cover-c": spot(3) } as CSSProperties;
}

/**
 * A workspace card's cover, laid over a `powder-cover`: one NDIF color picked
 * from the workspace's id leads, blending into its two neighbours on the wheel,
 * so each folder keeps a color of its own.
 */
export function folderCover(workspaceId: string): CSSProperties {
    const n = NDIF_COLORS.length;
    const lead = Math.floor(unit(workspaceId, 0) * n);
    const next = NDIF_COLORS[(lead + 1) % n];
    const prev = NDIF_COLORS[(lead + n - 1) % n];
    return {
        ...coverPlacement(workspaceId),
        background: `radial-gradient(circle at var(--cover-a), ${next}, transparent 60%), radial-gradient(circle at var(--cover-b), ${prev}, transparent 55%), ${NDIF_COLORS[lead]}`,
    };
}
