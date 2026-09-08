import { buildApp } from "./app.js";
import { closeDb } from "./db/client.js";
import { loadEnv } from "./env.js";
import { startWorker, stopWorker } from "./worker/processor.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await buildApp();

  await startWorker();

  await app.listen({ port: env.PORT, host: "0.0.0.0" });

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
