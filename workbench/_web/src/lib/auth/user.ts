import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in user's id, resolved from the session (the stub user when auth
 * is disabled). Server actions that act for "the current user" call this
 * rather than trusting a client-supplied id, since "use server" exports are
 * publicly callable RPC endpoints.
 */
export async function requireUserId(): Promise<string> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        throw new Error("Not signed in");
    }
    return user.id;
}
