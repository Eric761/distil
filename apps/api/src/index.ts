import { buildApp } from "./app.js";
import { closeDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { loadEnv } from "./env.js";
import { startWorker, stopWorker } from "./worker/processor.js";

async function main(): Promise<void> {
  const env = loadEnv();

  // Fast in-process migrate on wake — seed runs only via `releaseCommand` on deploy.
  await runMigrations();

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
