/**
 * The desktop sidebar's collapsed preference. A cookie rather than
 * localStorage so the shell layout can read it and render the right width on
 * the first paint.
 */
export const SIDEBAR_COLLAPSED_COOKIE = "workbench_sidebar_collapsed";

export function writeSidebarCollapsed(collapsed: boolean) {
    document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=${collapsed}; path=/; max-age=31536000; samesite=lax`;
}
