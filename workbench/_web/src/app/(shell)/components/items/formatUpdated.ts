const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * A compact "when was this last touched": "just now", "12 min ago",
 * "3 h ago", "yesterday", "4 days ago", then a date ("Oct 2", with the year
 * once it isn't this year's).
 */
export function formatUpdated(date: Date | string, now: Date = new Date()): string {
    const then = new Date(date);
    const elapsed = now.getTime() - then.getTime();
    if (elapsed < MINUTE) return "just now";
    if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
    if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} h ago`;
    const days = Math.floor(elapsed / DAY);
    if (days === 1) return "yesterday";
    if (days < 7) return `${days} days ago`;
    return then.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        ...(then.getFullYear() !== now.getFullYear() && { year: "numeric" }),
    });
}

/** The full timestamp, for a tooltip next to `formatUpdated`. */
export function formatTimestamp(date: Date | string): string {
    return new Date(date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * The bucket a newest-first list files a date under: "Today", "Yesterday",
 * "Previous 7 days", "Previous 30 days" or "Older" (calendar days, local time).
 */
export function recencyGroup(date: Date | string, now: Date = new Date()): string {
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((startOfDay(now) - startOfDay(new Date(date))) / DAY);
    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return "Previous 7 days";
    if (days < 30) return "Previous 30 days";
    return "Older";
}
