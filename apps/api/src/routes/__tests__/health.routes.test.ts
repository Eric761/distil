import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app.js";
import { closeDb } from "../../db/client.js";

describe("health routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  it("GET /api/ping responds without touching the database", async () => {
    const response = await app.inject({ method: "GET", url: "/api/ping" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });
});
