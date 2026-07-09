// app/providers.tsx
"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        // Only initialize PostHog if key is provided and not in development
        const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

        if (posthogKey) {
            posthog.init(posthogKey, {
                api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
                person_profiles: "identified_only",
                defaults: "2025-05-24",
            });
        }
    }, []);

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
