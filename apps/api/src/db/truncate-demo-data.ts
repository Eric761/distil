import { sql } from "drizzle-orm";
import { getDb } from "./client.js";

/** Wipes documents and related demo state. Safe to call before a full re-seed. */
export async function truncateDemoData(): Promise<void> {
  const db = getDb();
  await db.execute(sql`TRUNCATE TABLE documents CASCADE`);
  await db.execute(sql`TRUNCATE TABLE field_corrections CASCADE`);
  await db.execute(sql`TRUNCATE TABLE document_schemas CASCADE`);
}
