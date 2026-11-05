"use client"; // Error boundaries must be Client Components

import NextError from "next/error";
import { useEffect } from "react";
import { captureError } from "@/lib/errorTracking";

/**
 * The last-resort boundary, replacing the whole document: for errors in the
 * root layout and the shell's layout, and on pages outside the shell (admin,
 * sign-in, workshop joins). Shell pages have their own (`(shell)/error.tsx`).
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
    useEffect(() => {
        captureError(error, { source: "error_boundary", boundary: "global", digest: error.digest });
    }, [error]);

    return (
        // global-error must include html and body tags
        <html>
            <body>
                {/* `NextError` is the default Next.js error page component */}
                <NextError statusCode={0} />
            </body>
        </html>
    );
}
