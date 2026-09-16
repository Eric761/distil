import { buildApp } from "./app.js";
import { closeDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { runSeed } from "./db/seed.js";
import { loadEnv } from "./env.js";
import { startWorker, stopWorker } from "./worker/processor.js";

async function main(): Promise<void> {
  const env = loadEnv();

  // Migrate on every wake. Seed also runs here because Render free tier ignores
  // preDeployCommand — see README § Deployment.
  await runMigrations();
  if (env.SEED_DEMO_DATA) {
    if (env.SEED_RESET) {
      // eslint-disable-next-line no-console
      console.warn(
        "SEED_RESET is true — documents will be wiped and re-seeded on this start. Remove SEED_RESET after deploy.",
      );
    }
    await runSeed();
  }

  const app = await buildApp();

  // Listen before worker init so /api/ping and /api/health respond during cold start.
  await app.listen({ port: env.PORT, host: "0.0.0.0" });

  void startWorker().catch((error) => {
    app.log.error(error, "worker failed to start");
  });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`received ${signal}, shutting down`);
    stopWorker();
    await app.close();
    await closeDb();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("failed to start server", error);
  process.exit(1);
});
