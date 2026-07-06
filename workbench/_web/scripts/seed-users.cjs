/**
 * Seeds local Supabase Auth with two stub accounts for exercising the app with
 * real auth (NEXT_PUBLIC_DISABLE_AUTH=false):
 *
 *   - an admin  (email is added to ADMIN_EMAILS, so /admin/workshops lets it in)
 *   - a regular user
 *
 *   node scripts/seed-users.cjs
 *
 * Accounts are Supabase Auth users (auth.users), created via the service-role
 * admin API — not app tables. App data (workspaces, charts) is created by the
 * user once signed in. Idempotent: re-running resets the password of any
 * account that already exists.
 *
 * Env (all optional):
 *   SEED_USER_PASSWORD  password for every seeded account   (default "change-it")
 *   SEED_ADMIN_EMAIL    admin account email                 (default "admin@workbench.dev")
 *   SEED_USER_EMAIL     regular account email                (default "user@workbench.dev")
 * Requires (from .env, written by copy-env):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createClient } = require("@supabase/supabase-js");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
    console.error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
            "Run `node scripts/copy-env.js` and make sure the root .env is filled in.",
    );
    process.exit(1);
}

const password = process.env.SEED_USER_PASSWORD || "change-it";
const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@workbench.dev";
const regularEmail = process.env.SEED_USER_EMAIL || "user@workbench.dev";

const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});

// listUsers is paginated; scan pages until the email turns up or we run out.
async function findUserByEmail(email) {
    const target = email.toLowerCase();
    for (let page = 1; ; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        const match = data.users.find((u) => u.email?.toLowerCase() === target);
        if (match) return match;
        if (data.users.length < 1000) return null;
    }
}

async function upsertUser(email, isAdmin) {
    const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // no local mail round-trip
        app_metadata: { seeded: true, role: isAdmin ? "admin" : "user" },
    });
    if (!error) return { email, status: "created", id: data.user.id };

    // Already registered → reset its password so the known creds always work.
    if (/registered|already|exists/i.test(error.message)) {
        const existing = await findUserByEmail(email);
        if (!existing) throw error;
        const { error: updErr } = await admin.auth.admin.updateUserById(existing.id, {
            password,
            email_confirm: true,
        });
        if (updErr) throw updErr;
        return { email, status: "updated", id: existing.id };
    }
    throw error;
}

(async () => {
    const results = [
        await upsertUser(adminEmail, true),
        await upsertUser(regularEmail, false),
    ];
    for (const r of results) {
        console.log(`  ${r.status.padEnd(7)} ${r.email}  (${r.id})`);
    }
    console.log(`\nSeeded ${results.length} accounts on ${url} with password "${password}".`);
    const allowlist = (process.env.ADMIN_EMAILS ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
    if (!allowlist.includes(adminEmail.toLowerCase())) {
        console.warn(
            `\nWARNING: ${adminEmail} is not in ADMIN_EMAILS, so it won't reach /admin/workshops.\n` +
                `Add it to ADMIN_EMAILS in the root .env.`,
        );
    }
})().catch((err) => {
    console.error("Seed failed:", err.message ?? err);
    process.exit(1);
});
