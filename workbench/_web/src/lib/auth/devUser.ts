/**
 * The synthetic user id used by ownership guards when auth is disabled
 * (NEXT_PUBLIC_DISABLE_AUTH=true) — local dev and the bun:test DB suite.
 *
 * Defaults to the same stub id the Supabase mock client returns in
 * src/lib/supabase/server.ts, so local dev behaves as a single logged-in user.
 * Tests flip it via setDevUserId() to act as different users and exercise the
 * ownership guards (there's no real session to switch under DISABLE_AUTH).
 * In production DISABLE_AUTH is never set, so this module is inert.
 */
let devUserId = "local-dev-user";

export function getDevUserId(): string {
    return devUserId;
}

/** Test/dev only: set the acting user id for the DISABLE_AUTH identity. */
export function setDevUserId(id: string): void {
    devUserId = id;
}
