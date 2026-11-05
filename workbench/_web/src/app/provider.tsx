"use client";

import posthog, { type CaptureResult, type Properties } from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Strips query strings and fragments from the URLs posthog-js attaches to
 * every event (`$current_url`, `$referrer`, their `$initial_` and
 * `$session_entry_` copies), since a query can hold a prompt (`/new?prompt=…`)
 * or Prolific ids (`/w/<slug>?PROLIFIC_PID=…`). Campaign parameters are read
 * into their own properties before this runs, so attribution is kept.
 */
class EventUrls {
    static redact(event: CaptureResult | null): CaptureResult | null {
        if (!event) return event;
        for (const bag of [event.properties, event.$set, event.$set_once]) {
            if (bag) EventUrls.redactBag(bag);
        }
        return event;
    }

    private static redactBag(bag: Properties) {
        for (const [key, value] of Object.entries(bag)) {
            if (typeof value === "string") bag[key] = EventUrls.strip(value);
            else if (key === "$initial_person_info" && value && typeof value === "object") {
                EventUrls.redactBag(value as Properties);
            }
        }
    }

    private static strip(value: string): string {
        if (!/^https?:\/\//.test(value)) return value;
        const end = value.search(/[?#]/);
        return end === -1 ? value : value.slice(0, end);
    }
}

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
if (typeof window !== "undefined" && posthogKey && !posthog.__loaded) {
    posthog.init(posthogKey, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        person_profiles: "identified_only",
        defaults: "2025-05-24",
        capture_exceptions: {
            capture_unhandled_errors: true,
            capture_unhandled_rejections: true,
            capture_console_errors: false,
        },
        before_send: EventUrls.redact,
    });
}

/**
 * PostHog for the app, a no-op without `NEXT_PUBLIC_POSTHOG_KEY`. It is
 * initialized when this module loads rather than in an effect: effects run
 * child-first, so an error thrown, or caught by a route's error boundary, on
 * the first render would otherwise reach PostHog before it was ready.
 * `capture_exceptions` reports uncaught errors and unhandled rejections;
 * handled failures go through `captureError` (`lib/errorTracking.ts`).
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
    // Track Supabase auth changes and identify users in PostHog.
    useEffect(() => {
        if (!posthog.__loaded) return;

        const supabase = createClient();

        // Real (email) users are identified by email. Anonymous workshop
        // participants have no email — identify them by their Supabase user id
        // ONLY. We never send workshop/Prolific identifiers to PostHog; the id
        // is the sole key, and correlation to a Prolific participant is an
        // offline DB join on it (app_metadata / workspaces.prolific).
        const identify = (user: User | null | undefined) => {
            if (user?.email) {
                // $email/$name so PostHog displays the person properly.
                posthog.identify(user.email, {
                    userId: user.id,
                    email: user.email,
                    $name: user.email,
                    $email: user.email,
                });
            } else if (user?.app_metadata?.workshop_slug) {
                // workshop_slug only detects a participant; it is NOT sent.
                posthog.identify(user.id, { userId: user.id });
            }
        };

        supabase.auth.getUser().then(({ data: { user } }) => identify(user));

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event, session) => {
            if (session?.user) {
                identify(session.user);
            } else if (event === "SIGNED_OUT") {
                posthog.reset();
            }
        });

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    return <PHProvider client={posthog}>{children}</PHProvider>;
}
