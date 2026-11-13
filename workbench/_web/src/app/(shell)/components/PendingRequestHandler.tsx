"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { resumePendingRequest } from "@/lib/pendingRequest";

/**
 * Resumes a chart launch that was waiting on sign-in (saved to localStorage by
 * the login page) by sending it through `/new`. Mounted in the app shell, so it
 * runs wherever sign-in lands. `/new` resumes the request itself, so that a
 * blank chart isn't created first. The chart it creates reports its origin as
 * `"resumed"`.
 */
export function PendingRequestHandler() {
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (pathname !== "/new") resumePendingRequest(router);
    }, [pathname, router]);

    return null;
}
