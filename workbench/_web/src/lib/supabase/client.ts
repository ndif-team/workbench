import { createBrowserClient } from "@supabase/ssr";

const DEV_USER = {
    id: "local-dev-user",
    email: "dev@localhost",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date(0).toISOString(),
};

export function createClient() {
    // Mirror the server-side mock in ./server.ts so the browser doesn't
    // try to construct a real Supabase client (which logs noisy
    // "URL and API key are required" pageerrors in E2E / local-dev).
    if (process.env.NEXT_PUBLIC_DISABLE_AUTH === "true") {
        return {
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
            },
            storage: {
                from: () => ({
                    upload: async () => ({ data: { path: "" }, error: null }),
                    getPublicUrl: () => ({ data: { publicUrl: "" } }),
                }),
            },
            from: () => ({}),
        } as any;
    }

    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
}

export function getThumbnailPath(workspaceId: string, chartId: string) {
    // shard by workspace for easier browsing, day-level partition for cache busting optional later
    return `${workspaceId}/${chartId}.png`;
}

export async function uploadThumbnailPublic(blob: Blob, path: string): Promise<string> {
    const supabase = createClient();
    const { data, error } = await supabase.storage.from("thumbnails").upload(path, blob, {
        cacheControl: "31536000",
        upsert: true,
        contentType: "image/png",
    });
    if (error) throw error;
    const { data: publicUrl } = supabase.storage.from("thumbnails").getPublicUrl(path);
    return publicUrl.publicUrl;
}
