import { createClient } from "@/lib/supabase/server";

/**
 * Admin access is an env allowlist (ADMIN_EMAILS, comma-separated), not a role
 * system. The layout check on /admin is UX only — every admin server action
 * must call requireAdmin() itself, because "use server" exports are publicly
 * callable RPC endpoints regardless of which pages link to them.
 */
export async function getAdminEmail(): Promise<string | null> {
    const allowlist = (process.env.ADMIN_EMAILS ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
    if (allowlist.length === 0) return null;

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    const email = user?.email?.toLowerCase();

    return email && allowlist.includes(email) ? email : null;
}

export async function requireAdmin(): Promise<string> {
    const email = await getAdminEmail();
    if (!email) {
        throw new Error("Forbidden");
    }
    return email;
}
