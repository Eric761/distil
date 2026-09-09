import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { loadEnv } from "../env.js";
import * as schema from "./schema.js";

let sqlClient: ReturnType<typeof postgres> | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getSql(): ReturnType<typeof postgres> {
  if (!sqlClient) {
    const env = loadEnv();
    // Tuned for Render free tier: short connect timeout, modest pool, quick idle release.
    sqlClient = postgres(env.DATABASE_URL, {
      max: 5,
      connect_timeout: 30,
      idle_timeout: 20,
      max_lifetime: 60 * 30,
    });
  }
  return sqlClient;
}

export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (!dbInstance) {
    dbInstance = drizzle(getSql(), { schema });
  }
  return dbInstance;
}

export type Database = ReturnType<typeof getDb>;

export async function closeDb(): Promise<void> {
  if (sqlClient) {
    await sqlClient.end({ timeout: 5 });
    sqlClient = null;
    dbInstance = null;
  }
}

export { schema };
