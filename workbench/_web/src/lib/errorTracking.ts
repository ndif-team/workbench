import posthog from "posthog-js";
import { isCancelledError } from "@tanstack/react-query";
import { ErrorRedaction } from "./errorRedaction";

/**
 * Client-side reporting of handled errors to PostHog error tracking. Uncaught
 * errors and unhandled rejections are captured by posthog-js itself
 * (`capture_exceptions` in `provider.tsx`); this covers the failures the app
 * catches and recovers from.
 */
export class ErrorTracking {
    private static reported = new WeakSet<object>();

    /**
     * Reports `error` once: a site that captures and rethrows isn't reported
     * again by the query cache or a boundary. Cancellations are skipped, and
     * a Next.js `digest` is attached so a failed server action or server
     * component links to the server's own `$exception` event. Never throws.
     */
    static capture(error: unknown, properties?: Record<string, unknown>) {
        if (!posthog.__loaded || ErrorTracking.isCancellation(error)) return;
        if (typeof error === "object" && error !== null) {
            if (ErrorTracking.reported.has(error)) return;
            ErrorTracking.reported.add(error);
        }
        try {
            posthog.captureException(ErrorRedaction.redacted(error), {
                digest: ErrorTracking.digestOf(error),
                ...properties,
            });
        } catch {
            // Reporting must never break the caller's recovery.
        }
    }

    /**
     * The first segment of a React Query key, a static label such as
     * `"chart"`. The rest holds ids and sometimes user input, so it's never sent.
     */
    static keyLabel(key: readonly unknown[] | undefined): string | undefined {
        const head = key?.[0];
        return typeof head === "string" ? head : undefined;
    }

    /** Whether `error` is a cancelled request or query rather than a failure. */
    static isCancellation(error: unknown): boolean {
        return (error instanceof Error && error.name === "AbortError") || isCancelledError(error);
    }

    private static digestOf(error: unknown): string | undefined {
        const digest = (error as { digest?: unknown } | null)?.digest;
        return typeof digest === "string" ? digest : undefined;
    }
}

/**
 * Reports a handled error to PostHog error tracking, for failures the app
 * catches and recovers from (a toast, an inline message) that would otherwise
 * leave no trace. A no-op until PostHog is initialized (e.g. when
 * `NEXT_PUBLIC_POSTHOG_KEY` is unset), and for cancellations.
 *
 * `properties` say where it happened (`source`, the action that failed); never
 * user-authored text such as prompts, names or report content.
 */
export function captureError(error: unknown, properties?: Record<string, unknown>) {
    ErrorTracking.capture(error, properties);
}
