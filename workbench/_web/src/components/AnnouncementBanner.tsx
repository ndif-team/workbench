"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { ANNOUNCEMENT, writeAnnouncementDismissed } from "@/lib/announcement";

/**
 * The announcement strip above the landing page and Home (`ANNOUNCEMENT`),
 * led by the announced event's logo. The server renders it only until it
 * is dismissed (`readAnnouncementDismissed`).
 */
export function AnnouncementBanner() {
    const [dismissed, setDismissed] = useState(false);
    if (dismissed) return null;

    return (
        <aside
            aria-label="Announcement"
            className="relative z-20 flex shrink-0 items-center gap-2 bg-foreground py-2 pl-10 pr-1 text-background dark:bg-secondary dark:text-secondary-foreground"
        >
            <p className="min-w-0 flex-1 text-balance text-center text-sm">
                <img
                    src={ANNOUNCEMENT.logo}
                    alt=""
                    className="mr-2 inline-block size-5 align-[-0.3em]"
                />
                {ANNOUNCEMENT.lead}{" "}
                <a
                    href={ANNOUNCEMENT.href}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-sm font-medium underline decoration-1 underline-offset-4 hover:decoration-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
                >
                    {ANNOUNCEMENT.link}
                </a>
            </p>
            <button
                type="button"
                aria-label="Dismiss announcement"
                onClick={() => {
                    writeAnnouncementDismissed();
                    setDismissed(true);
                }}
                className="flex size-8 shrink-0 items-center justify-center rounded-md opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
            >
                <X className="size-4" />
            </button>
        </aside>
    );
}
