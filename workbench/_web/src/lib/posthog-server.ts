import { headers } from "next/headers";
import { PostHog } from "posthog-node";
import { ErrorRedaction } from "./errorRedaction";

/** posthog-node for server-side events and errors; a no-op without `NEXT_PUBLIC_POSTHOG_KEY`. */
export class PostHogServer {
    private static readonly key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    private static readonly options = {
        host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        flushAt: 1,
        flushInterval: 0,
    };
    private static readonly sendTimeoutMs = 2000;

    /**
     * Reports a server-side error and waits until it is sent, so a serverless
     * function can't end first. It uses a client of its own because posthog-node
     * builds `$exception` events asynchronously: `captureExceptionImmediate`
     * resolves before the event is built and `flush` can run before it is
     * queued, so `shutdown` is the one call that waits for it. Never throws.
     */
    static async captureException(
        error: unknown,
        distinctId?: string,
        properties?: Record<string, unknown>,
    ): Promise<void> {
        await PostHogServer.send((client) =>
            client.captureException(ErrorRedaction.redacted(error), distinctId, properties),
        );
    }

    /**
     * Sends a server-side product event and waits until it is sent, like
     * `captureException`. Call it inside `after()` so the response doesn't
     * wait on PostHog. Never throws.
     */
    static async capture(
        distinctId: string,
        event: string,
        properties?: Record<string, unknown>,
    ): Promise<void> {
        await PostHogServer.send((client) => client.capture({ distinctId, event, properties }));
    }

    /**
     * The distinct id the user's browser reports events under: its PostHog
     * cookie when the request has one, else the id `provider.tsx` identifies
     * the user by (their email, or the user id for an anonymous participant).
     */
    static async distinctIdFor(user: { id: string; email?: string | null }): Promise<string> {
        const cookieHeader = (await headers()).get("cookie") ?? undefined;
        return PostHogServer.distinctIdFromCookies(cookieHeader) ?? user.email ?? user.id;
    }

    private static async send(enqueue: (client: PostHog) => void): Promise<void> {
        if (!PostHogServer.key) return;
        try {
            const client = new PostHog(PostHogServer.key, PostHogServer.options);
            try {
                enqueue(client);
            } finally {
                await client.shutdown(PostHogServer.sendTimeoutMs);
            }
        } catch {
            // Reporting must never fail the request it reports on.
        }
    }

    /** The visitor's PostHog distinct id, from the `ph_<key>_posthog` cookie posthog-js sets. */
    static distinctIdFromCookies(cookieHeader: string | undefined): string | undefined {
        if (!PostHogServer.key || !cookieHeader) return undefined;
        const prefix = `ph_${PostHogServer.key}_posthog=`;
        const cookie = cookieHeader.split(/;\s*/).find((c) => c.startsWith(prefix));
        if (!cookie) return undefined;
        try {
            const id = JSON.parse(decodeURIComponent(cookie.slice(prefix.length)))?.distinct_id;
            return typeof id === "string" ? id : undefined;
        } catch {
            return undefined;
        }
    }
}
