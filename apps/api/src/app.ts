import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { loadEnv } from "./env.js";
import { registerErrorHandler } from "./lib/errors.js";
import { documentRoutes } from "./routes/documents.js";
import { queryRoutes } from "./routes/query.js";
import { reviewQueueRoutes } from "./routes/review-queue.js";
import { healthRoutes } from "./routes/health.js";

export async function buildApp(): Promise<FastifyInstance> {
  const env = loadEnv();
  const app = Fastify({
    logger: env.NODE_ENV !== "test",
    // Must cover MAX_UPLOAD_BYTES plus multipart boundaries/headers
    bodyLimit: env.MAX_UPLOAD_BYTES + 256 * 1024,
    genReqId: () => globalThis.crypto.randomUUID(),
  });

  await app.register(cors, {
    origin: env.NODE_ENV === "production" ? false : env.CORS_ORIGIN.split(","),
    methods: ["GET", "POST", "PATCH", "DELETE"],
  });

  await app.register(multipart, {
    limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 1 },
  });

  app.setErrorHandler((error, request, reply) => {
    registerErrorHandler(request, reply, error);
  });

  await app.register(documentRoutes);
  await app.register(queryRoutes);
  await app.register(reviewQueueRoutes);
  await app.register(healthRoutes);

  // In production, serve the built SPA from the same origin (no CORS).
  const webDist = fileURLToPath(new URL("../../web/dist", import.meta.url));
  if (env.NODE_ENV === "production" && existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api")) {
        return reply.status(404).type("application/problem+json").send({
          code: "NOT_FOUND",
          title: "Not found",
          detail: `No route for ${request.method} ${request.url}.`,
          status: 404,
          requestId: request.id,
        });
      }
      return reply.sendFile("index.html");
    });
  } else {
    app.setNotFoundHandler((request, reply) => {
      return reply.status(404).type("application/problem+json").send({
        code: "NOT_FOUND",
        title: "Not found",
        detail: `No route for ${request.method} ${request.url}.`,
        status: 404,
        requestId: request.id,
      });
    });
  }

  return app;
}
