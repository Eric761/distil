import { sql } from "drizzle-orm";
import { closeDb, getDb } from "./client.js";

async function main(): Promise<void> {
  const db = getDb();
  await db.execute(sql`TRUNCATE TABLE documents CASCADE`);
  await db.execute(sql`TRUNCATE TABLE field_corrections CASCADE`);
  // eslint-disable-next-line no-console
  console.log("database truncated");
  await closeDb();
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("reset failed", error);
  process.exit(1);
});
