import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

config({ path: '.env' }); // or .env.local

const isE2E = process.env.NEXT_PUBLIC_E2E === 'true';

let dbImpl: ReturnType<typeof drizzle>;

if (isE2E) {
  // @ts-ignore - provide a very small mock API used in server actions
  dbImpl = {
    select: () => ({ from: () => ({ where: () => [], innerJoin: () => [], orderBy: () => [], limit: () => [] }) }),
    update: () => ({ set: () => ({ where: () => ({}) }) }),
    insert: () => ({ values: () => ({ returning: () => [{ id: 'e2e-id', createdAt: new Date().toISOString() }] }) }),
    delete: () => ({ where: () => ({}) }),
  } as unknown as ReturnType<typeof drizzle>;
} else {
  const connectionString = process.env.DATABASE_URL!;
  const client = postgres(connectionString, { prepare: false });
  dbImpl = drizzle({ client });
}

export const db = dbImpl;
