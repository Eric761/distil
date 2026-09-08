import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDb, getDb } from "./client.js";

async function main(): Promise<void> {
  const db = getDb();
  await migrate(db, { migrationsFolder: new URL("../../drizzle", import.meta.url).pathname });
  // eslint-disable-next-line no-console
  console.log("migrations applied");
  await closeDb();
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("migration failed", error);
  process.exit(1);
});
