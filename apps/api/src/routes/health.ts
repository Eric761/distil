import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { getDb } from "../db/client.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  /** Lightweight keep-alive for uptime monitors — no DB, responds as soon as the server is up. */
  app.get("/api/ping", async () => ({ ok: true }));

  app.get("/api/health", async (_request, reply) => {
    try {
      await getDb().execute(sql`select 1`);
      return { status: "ok", db: "up" };
    } catch {
      return reply.status(503).send({ status: "degraded", db: "down" });
    }
  });
}
