import { closeDb } from "./client.js";
import { truncateDemoData } from "./truncate-demo-data.js";

async function main(): Promise<void> {
  await truncateDemoData();
  // eslint-disable-next-line no-console
  console.log("database truncated");
  await closeDb();
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("reset failed", error);
  process.exit(1);
});
