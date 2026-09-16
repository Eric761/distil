import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app.js";
import { closeDb } from "../../db/client.js";

describe("document routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  it("rejects unsupported file types before persistence", async () => {
    const boundary = "----distil-test";
    const payload = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="malware.exe"',
      "Content-Type: application/x-msdownload",
      "",
      "MZ not a document",
      `--${boundary}--`,
      "",
    ].join("\r\n");

    const response = await app.inject({
      method: "POST",
      url: "/api/documents",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload,
    });

    expect(response.statusCode).toBe(400);
    const body = response.json() as { code: string };
    expect(body.code).toBe("UNSUPPORTED_FILE");
  });
});
