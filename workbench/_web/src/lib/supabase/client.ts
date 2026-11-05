import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEV_USER = {
    id: "local-dev-user",
    email: "dev@localhost",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date(0).toISOString(),
};

// Minimum surface that the workbench actually touches on the browser
// Supabase client — matches the callers in
// app/{provider,login,workbench}/page.tsx and components/{UserDropdown,
// WorkspaceNameEditor,LandingPage}.tsx.
// Defining the shape here lets us avoid `as any` while still being a
// drop-in replacement for createBrowserClient under DISABLE_AUTH.
type MockBrowserClient = Pick<SupabaseClient, "auth" | "from">;

export function createClient(): SupabaseClient {
    // Mirror the server-side mock in ./server.ts so the browser doesn't
    // try to construct a real Supabase client (which logs noisy
    // "URL and API key are required" pageerrors in E2E / local-dev).
    if (process.env.NEXT_PUBLIC_DISABLE_AUTH === "true") {
        const mock: MockBrowserClient = {
            auth: {
                getUser: async () => ({ data: { user: DEV_USER }, error: null }),
                signOut: async () => ({ error: null }),
                signInWithOAuth: async () => ({ data: { url: null }, error: null }),
                signInAnonymously: async () => ({
                    data: { user: DEV_USER, session: null },
                    error: null,
                }),
                onAuthStateChange: () => ({
                    data: { subscription: { unsubscribe: () => {} } },
                }),
            } as unknown as SupabaseClient["auth"],
            from: () => ({}) as unknown as ReturnType<SupabaseClient["from"]>,
        };
        return mock as SupabaseClient;
    }

    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
}
