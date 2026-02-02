/**
 * Test setup file for database tests.
 * Sets environment variables for local SQLite testing with in-memory database.
 */

// Force local SQLite mode for tests
process.env.NEXT_PUBLIC_LOCAL_DB = "true";
process.env.NEXT_PUBLIC_DISABLE_AUTH = "true";

// Use in-memory database for tests - this gets picked up by client.ts
process.env.LOCAL_SQLITE_URL = ":memory:";
