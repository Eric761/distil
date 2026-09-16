import { z } from "zod";
import { schemaFieldDef, schemaStatus } from "./extraction.js";

/** One version (draft or published) of a schema family. */
export const schemaVersionSummary = z.object({
  versionId: z.string().uuid(),
  version: z.string(),
  status: schemaStatus,
  adHoc: z.boolean(),
  /** How many documents currently use this version. */
  documentCount: z.number().int().min(0),
  createdAt: z.string().datetime(),
});
export type SchemaVersionSummary = z.infer<typeof schemaVersionSummary>;

/** A schema family with its versions, for the lightweight Schemas library. */
export const schemaFamily = z.object({
  key: z.string(),
  name: z.string(),
  builtIn: z.boolean(),
  documentCount: z.number().int().min(0),
  lastUsedAt: z.string().datetime().nullable(),
  versions: z.array(schemaVersionSummary),
});
export type SchemaFamily = z.infer<typeof schemaFamily>;

export const schemaListResponse = z.object({
  families: z.array(schemaFamily),
});
export type SchemaListResponse = z.infer<typeof schemaListResponse>;

/** Full definition of a single schema version. */
export const schemaVersionDetail = z.object({
  key: z.string(),
  name: z.string(),
  versionId: z.string().uuid(),
  version: z.string(),
  status: schemaStatus,
  adHoc: z.boolean(),
  fields: z.array(schemaFieldDef),
});
export type SchemaVersionDetail = z.infer<typeof schemaVersionDetail>;
