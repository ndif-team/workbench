/**
 * Test setup file for database tests.
 * Sets environment variables for local SQLite testing.
 * 
 * Note: The test database schema is created by drizzle-kit push
 * which runs in the test.sh script before tests start.
 */

// Force local SQLite mode for tests
process.env.NEXT_PUBLIC_LOCAL_DB = "true";
process.env.NEXT_PUBLIC_DISABLE_AUTH = "true";

// Use test database file (created by test.sh script)
process.env.LOCAL_SQLITE_URL = ".test.db";
