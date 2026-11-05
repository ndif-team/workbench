import type { Instrumentation } from "next";

export function register() {
    // No-op for initialization
}

/**
 * Reports server errors (renders, route handlers, server actions) to PostHog
 * error tracking under the visitor's PostHog id when the browser has one. Only
 * the route's pattern is sent, never the request path, whose query string can
 * hold a prompt. Node runtime only; never throws.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;
    try {
        const { PostHogServer } = await import("./src/lib/posthog-server");
        const cookie = request.headers.cookie;
        const distinctId = PostHogServer.distinctIdFromCookies(
            Array.isArray(cookie) ? cookie.join("; ") : cookie,
        );
        const digest = (err as { digest?: unknown } | null)?.digest;
        await PostHogServer.captureException(err, distinctId, {
            source: "server",
            route_path: context.routePath,
            route_type: context.routeType,
            router_kind: context.routerKind,
            render_source: context.renderSource,
            digest: typeof digest === "string" ? digest : undefined,
        });
    } catch {
        // Reporting must never fail the request it reports on.
    }
};
