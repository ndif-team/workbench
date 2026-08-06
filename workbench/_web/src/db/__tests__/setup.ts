/**
 * Preloaded test setup (bunfig.toml).
 * Sets environment variables for local SQLite testing, and stands in for the few
 * browser globals a store under test reaches for.
 *
 * Note: The test database schema is created by drizzle-kit push
 * which runs in the test.sh script before tests start.
 */

// Force local SQLite mode for tests
process.env.NEXT_PUBLIC_LOCAL_DB = "true";
process.env.NEXT_PUBLIC_DISABLE_AUTH = "true";

// Use test database file (created by test.sh script)
process.env.LOCAL_SQLITE_URL = ".test.db";

// zustand's `persist` resolves its storage once, when the store module is first
// imported — so a store test can't install this itself (imports are hoisted), and
// without it every action logs "the given storage is currently unavailable".
if (!("localStorage" in globalThis)) {
    const entries = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
            getItem: (key: string) => entries.get(key) ?? null,
            setItem: (key: string, value: string) => void entries.set(key, value),
            removeItem: (key: string) => void entries.delete(key),
            clear: () => entries.clear(),
        },
    });
}
