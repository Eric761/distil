import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDb, getDb } from "./client.js";

const migrationsFolder = new URL("../../drizzle", import.meta.url).pathname;

export async function runMigrations(options?: { closeAfter?: boolean }): Promise<void> {
  const db = getDb();
  await migrate(db, { migrationsFolder });
  // eslint-disable-next-line no-console
  console.log("migrations applied");
  if (options?.closeAfter) {
    await closeDb();
  }
}

async function main(): Promise<void> {
  await runMigrations({ closeAfter: true });
}

if (import.meta.main) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error("migration failed", error);
    process.exit(1);
  });
}
