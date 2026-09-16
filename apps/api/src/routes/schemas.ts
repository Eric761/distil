import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { schemaFieldDef } from "@invoice/contracts";
import { badRequest } from "../lib/errors.js";
import {
  createSchemaDraft,
  getSchemaVersion,
  listSchemas,
  publishSchema,
  updateSchemaDraft,
} from "../services/schema-service.js";

const uuidParam = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function assertUuid(id: string): string {
  if (!uuidParam.test(id)) throw badRequest("Invalid schema version id.");
  return id;
}

const updateDraftBody = z.object({ fields: z.array(schemaFieldDef) });
const createDraftBody = z.object({
  key: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(120),
  fields: z.array(schemaFieldDef).optional(),
  adHoc: z.boolean().optional(),
});

export async function schemaRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/schemas", async () => {
    return listSchemas();
  });

  app.post("/api/schemas", async (request, reply) => {
    const body = createDraftBody.parse(request.body);
    const created = await createSchemaDraft(body);
    return reply.status(201).send(created);
  });

  app.get<{ Params: { versionId: string } }>("/api/schemas/versions/:versionId", async (request) => {
    return getSchemaVersion(assertUuid(request.params.versionId));
  });

  app.patch<{ Params: { versionId: string } }>("/api/schemas/versions/:versionId", async (request) => {
    const body = updateDraftBody.parse(request.body);
    return updateSchemaDraft(assertUuid(request.params.versionId), body.fields);
  });

  app.post<{ Params: { versionId: string } }>("/api/schemas/versions/:versionId/publish", async (request) => {
    return publishSchema(assertUuid(request.params.versionId));
  });
}
