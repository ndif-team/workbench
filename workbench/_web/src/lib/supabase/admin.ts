import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client authenticated with the service-role key. Server-only:
 * used to stamp `app_metadata` on workshop participants via the admin API.
 * Unlike server.ts this never touches cookies — it carries no user session.
 */
export function createAdminClient() {
    if (typeof window !== "undefined") {
        throw new Error("createAdminClient is server-only");
    }
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    }
    return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}
