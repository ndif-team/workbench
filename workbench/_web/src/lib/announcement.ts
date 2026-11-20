/**
 * The announcement shown above the landing page and Home. Dismissing it is
 * remembered in a cookie, rather than localStorage, so the server leaves the
 * banner out of the first paint. Change `id` with the message: a dismissal
 * only hides the announcement it was made on.
 */
export const ANNOUNCEMENT = {
    id: "looped-lens-challenge",
    logo: "/images/looped-lens-challenge.svg",
    lead: "Register interest to our Looped Transformer Competition:",
    link: "The Looped Lens Challenge",
    href: "https://ndif.us/looped-lens-challenge",
} as const;

export const ANNOUNCEMENT_COOKIE = "workbench_announcement_dismissed";

export function readAnnouncementDismissed(value: string | undefined): boolean {
    return value === ANNOUNCEMENT.id;
}

export function writeAnnouncementDismissed() {
    document.cookie = `${ANNOUNCEMENT_COOKIE}=${ANNOUNCEMENT.id}; path=/; max-age=31536000; samesite=lax`;
}
