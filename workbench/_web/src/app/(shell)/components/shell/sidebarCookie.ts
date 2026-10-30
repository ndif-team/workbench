/**
 * The desktop sidebar's collapsed preference. A cookie rather than
 * localStorage so the shell layout can read it and render the right width on
 * the first paint.
 */
export const SIDEBAR_COLLAPSED_COOKIE = "workbench_sidebar_collapsed";

export function writeSidebarCollapsed(collapsed: boolean) {
    document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=${collapsed}; path=/; max-age=31536000; samesite=lax`;
}

/** The expanded sidebar's width in px, set by dragging its edge; a cookie for the same reason. */
export const SIDEBAR_WIDTH_COOKIE = "workbench_sidebar_width";

export const SIDEBAR_WIDTH = { min: 208, default: 256, max: 480 } as const;

export function clampSidebarWidth(width: number): number {
    return Math.round(Math.min(SIDEBAR_WIDTH.max, Math.max(SIDEBAR_WIDTH.min, width)));
}

/** The width a cookie value stands for: the default when it's missing or not a number. */
export function readSidebarWidth(value: string | undefined): number {
    const width = Number(value);
    return value && Number.isFinite(width) ? clampSidebarWidth(width) : SIDEBAR_WIDTH.default;
}

export function writeSidebarWidth(width: number) {
    document.cookie = `${SIDEBAR_WIDTH_COOKIE}=${width}; path=/; max-age=31536000; samesite=lax`;
}
