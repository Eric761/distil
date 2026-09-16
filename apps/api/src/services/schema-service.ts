import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  ERROR_CODES,
  type SchemaFamily,
  type SchemaFieldDef,
  type SchemaListResponse,
  type SchemaTree,
  type SchemaVersionDetail,
  type SchemaVersionSummary,
} from "@invoice/contracts";
import { getDb, type Database } from "../db/client.js";
import {
  documentSchemaVersions,
  documentSchemas,
  documents,
  extractions,
} from "../db/schema.js";
import { buildResumeSchemaFields } from "@invoice/extraction";
import { AppError, notFound } from "../lib/errors.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Tx;

export const INVOICE_SCHEMA_KEY = "invoice";
export const INVOICE_SCHEMA_NAME = "Invoice";
export const INVOICE_SCHEMA_VERSION = "v1";

export const RESUME_SCHEMA_KEY = "resume";
export const RESUME_SCHEMA_NAME = "Resume";
export const RESUME_SCHEMA_VERSION = "v1";

/**
 * The canonical, published invoice schema. This is the declared shape that the
 * trusted invoice projection is built from; individual fixtures may extract a
 * few extra ad-hoc fields (e.g. poNumber, discount) which still render as
 * fields but are not part of the declared schema.
 */
export function buildInvoiceSchemaTree(): SchemaTree {
  const scalar = (
    key: string,
    label: string,
    type: SchemaFieldDef["type"],
    group: string,
    opts: Partial<SchemaFieldDef> = {},
  ): SchemaFieldDef => ({
    key,
    label,
    type,
    nodeKind: "scalar",
    group,
    required: opts.required ?? false,
    material: opts.material ?? false,
    semanticKey: opts.semanticKey ?? null,
    isSummary: opts.isSummary ?? false,
  });

  const fields: SchemaFieldDef[] = [
    scalar("vendorName", "Vendor", "string", "identity", {
      required: true,
      semanticKey: "organization",
      isSummary: true,
    }),
    scalar("invoiceNumber", "Invoice number", "string", "identity", {
      required: true,
      semanticKey: "identifier",
      isSummary: true,
    }),
    scalar("currency", "Currency", "currency", "identity", { required: true, semanticKey: "currency" }),
    scalar("invoiceDate", "Invoice date", "date", "dates", { required: true, semanticKey: "date" }),
    scalar("dueDate", "Due date", "date", "dates", { semanticKey: "date" }),
    scalar("subtotal", "Subtotal", "decimal", "amounts", { material: true, semanticKey: "amount" }),
    scalar("tax", "Tax", "decimal", "amounts", { material: true, semanticKey: "amount" }),
    scalar("total", "Total", "decimal", "amounts", {
      required: true,
      material: true,
      semanticKey: "amount",
      isSummary: true,
    }),
    scalar("paymentTerms", "Payment terms", "string", "metadata"),
    {
      key: "lineItems",
      label: "Line items",
      type: "array",
      nodeKind: "array",
      group: "lineItems",
      required: false,
      material: true,
      item: {
        key: "lineItem",
        label: "Line item",
        type: "object",
        nodeKind: "object",
        group: "lineItems",
        required: false,
        material: false,
        children: [
          scalar("description", "Description", "string", "lineItems"),
          scalar("quantity", "Quantity", "decimal", "lineItems"),
          scalar("unitPrice", "Unit price", "decimal", "lineItems"),
          scalar("lineTotal", "Line total", "decimal", "lineItems", { material: true }),
        ],
      },
    },
  ];

  return {
    key: INVOICE_SCHEMA_KEY,
    name: INVOICE_SCHEMA_NAME,
    version: INVOICE_SCHEMA_VERSION,
    status: "published",
    adHoc: false,
    fields,
  };
}

/** The canonical, published resume/CV schema (matches structural resume extraction). */
export function buildResumeSchemaTree(): SchemaTree {
  return {
    key: RESUME_SCHEMA_KEY,
    name: RESUME_SCHEMA_NAME,
    version: RESUME_SCHEMA_VERSION,
    status: "published",
    adHoc: false,
    fields: buildResumeSchemaFields(),
  };
}

const LINE_PATH = /^lineItems\[(\d+)\]\.(description|quantity|unitPrice|lineTotal)$/u;

/** Map an invoice instance path to its stable schema-field key. */
export function invoiceSchemaFieldKey(path: string): string {
  const m = LINE_PATH.exec(path);
  return m ? `lineItems[].${m[2]}` : path;
}

/** The rules an invoice schema declares (allowlisted validator keys). */
export const INVOICE_RULE_KEYS = ["invoiceReconciliation"] as const;

function slugKey(input: string): string {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 64);
  return cleaned || "schema";
}

function schemaFieldErrors(
  fields: SchemaFieldDef[],
  parentPath = "fields",
): Array<{ path: string; message: string }> {
  const errors: Array<{ path: string; message: string }> = [];
  const seen = new Set<string>();
  fields.forEach((field, index) => {
    const path = `${parentPath}.${index}`;
    const key = field.key.trim();
    if (!key) errors.push({ path: `${path}.key`, message: "Field key cannot be empty." });
    if (seen.has(key)) {
      errors.push({ path: `${path}.key`, message: `Field key "${key}" is duplicated at this level.` });
    }
    seen.add(key);
    if (!field.label.trim()) {
      errors.push({ path: `${path}.label`, message: "Field label cannot be empty." });
    }
    if (field.nodeKind === "object") {
      errors.push(...schemaFieldErrors(field.children ?? [], `${path}.children`));
    }
    if (field.nodeKind === "array") {
      errors.push(...schemaFieldErrors(field.item?.children ?? [], `${path}.item.children`));
    }
  });
  return errors;
}

function assertValidFields(fields: SchemaFieldDef[], publishing = false): void {
  const fieldErrors = schemaFieldErrors(fields);
  if (publishing && fields.length === 0) {
    fieldErrors.unshift({ path: "fields", message: "Add at least one field before publishing." });
  }
  if (fieldErrors.length > 0) {
    throw new AppError({
      code: ERROR_CODES.VALIDATION_FAILED,
      status: 400,
      title: "Invalid schema",
      detail: publishing
        ? "Resolve the schema field errors before publishing."
        : "Resolve the schema field errors before saving.",
      fieldErrors,
    });
  }
}

async function ensureBuiltInSchemaFamily(exec: Executor, tree: SchemaTree): Promise<void> {
  const [existing] = await exec
    .select({ id: documentSchemas.id, builtIn: documentSchemas.builtIn })
    .from(documentSchemas)
    .where(eq(documentSchemas.key, tree.key))
    .limit(1);

  let schemaId = existing?.id;
  if (!schemaId) {
    const [row] = await exec
      .insert(documentSchemas)
      .values({ key: tree.key, name: tree.name, builtIn: true })
      .returning({ id: documentSchemas.id });
    schemaId = row!.id;
  } else if (!existing!.builtIn) {
    await exec
      .update(documentSchemas)
      .set({ name: tree.name, builtIn: true })
      .where(eq(documentSchemas.id, schemaId));
  }

  const [version] = await exec
    .select({ id: documentSchemaVersions.id })
    .from(documentSchemaVersions)
    .where(
      and(eq(documentSchemaVersions.schemaId, schemaId), eq(documentSchemaVersions.version, tree.version)),
    )
    .limit(1);

  if (version) {
    await exec.update(documentSchemas).set({ name: tree.name }).where(eq(documentSchemas.id, schemaId));
    await exec
      .update(documentSchemaVersions)
      .set({
        status: "published",
        adHoc: false,
        definition: tree.fields,
      })
      .where(eq(documentSchemaVersions.id, version.id));
  } else {
    await exec.insert(documentSchemaVersions).values({
      schemaId,
      version: tree.version,
      status: "published",
      adHoc: false,
      definition: tree.fields,
    });
  }
}

/** Ensure built-in schema families (invoice, resume) and their published v1 versions exist. */
export async function ensureBuiltInSchemas(exec: Executor = getDb()): Promise<void> {
  await ensureBuiltInSchemaFamily(exec, buildInvoiceSchemaTree());
  await ensureBuiltInSchemaFamily(exec, buildResumeSchemaTree());
}

/** Resolve the published invoice schema version id (for extraction lineage). */
export async function getInvoiceSchemaVersionId(exec: Executor = getDb()): Promise<string | null> {
  const [schema] = await exec
    .select({ id: documentSchemas.id })
    .from(documentSchemas)
    .where(eq(documentSchemas.key, INVOICE_SCHEMA_KEY))
    .limit(1);
  if (!schema) return null;
  const [version] = await exec
    .select({ id: documentSchemaVersions.id })
    .from(documentSchemaVersions)
    .where(
      and(
        eq(documentSchemaVersions.schemaId, schema.id),
        eq(documentSchemaVersions.version, INVOICE_SCHEMA_VERSION),
      ),
    )
    .limit(1);
  return version?.id ?? null;
}

/**
 * Register (or refresh) an inferred ad-hoc schema so it appears in the Schemas
 * library and can be reused/published later. Idempotent per (key, version).
 */
export async function registerAdHocSchema(
  exec: Executor,
  schema: SchemaTree,
): Promise<{ schemaId: string; versionId: string }> {
  const [existing] = await exec
    .select({ id: documentSchemas.id })
    .from(documentSchemas)
    .where(eq(documentSchemas.key, schema.key))
    .limit(1);

  let schemaId = existing?.id;
  if (!schemaId) {
    const [row] = await exec
      .insert(documentSchemas)
      .values({ key: schema.key, name: schema.name, builtIn: false })
      .returning({ id: documentSchemas.id });
    schemaId = row!.id;
  }

  const version = schema.version || "draft";
  const [existingVersion] = await exec
    .select({ id: documentSchemaVersions.id })
    .from(documentSchemaVersions)
    .where(
      and(eq(documentSchemaVersions.schemaId, schemaId), eq(documentSchemaVersions.version, version)),
    )
    .limit(1);

  if (existingVersion) {
    // Only refresh drafts; published versions are immutable.
    await exec
      .update(documentSchemaVersions)
      .set({ definition: schema.fields })
      .where(
        and(
          eq(documentSchemaVersions.id, existingVersion.id),
          eq(documentSchemaVersions.status, "draft"),
        ),
      );
    return { schemaId, versionId: existingVersion.id };
  }

  const [row] = await exec
    .insert(documentSchemaVersions)
    .values({
      schemaId,
      version,
      status: schema.status,
      adHoc: schema.adHoc,
      definition: schema.fields,
    })
    .returning({ id: documentSchemaVersions.id });
  return { schemaId, versionId: row!.id };
}

interface VersionUsage {
  documentCount: number;
  lastUsedAt: Date | null;
}

/** Current-document usage for each schema version. */
async function usageByVersion(versionIds: string[]): Promise<Map<string, VersionUsage>> {
  const usage = new Map<string, VersionUsage>();
  if (versionIds.length === 0) return usage;
  const db = getDb();
  const rows = await db
    .select({
      versionId: extractions.schemaVersionId,
      c: sql<number>`count(*)`,
      lastUsedAt: sql<Date | null>`max(${documents.updatedAt})`,
    })
    .from(extractions)
    .innerJoin(documents, eq(documents.currentExtractionId, extractions.id))
    .where(inArray(extractions.schemaVersionId, versionIds))
    .groupBy(extractions.schemaVersionId);
  for (const r of rows) {
    if (r.versionId) {
      usage.set(r.versionId, {
        documentCount: Number(r.c ?? 0),
        lastUsedAt: r.lastUsedAt ? new Date(r.lastUsedAt) : null,
      });
    }
  }
  return usage;
}

export async function listSchemas(): Promise<SchemaListResponse> {
  await ensureBuiltInSchemas();
  const db = getDb();
  const schemaRows = await db.select().from(documentSchemas).orderBy(desc(documentSchemas.builtIn));
  const versionRows = await db
    .select()
    .from(documentSchemaVersions)
    .orderBy(desc(documentSchemaVersions.createdAt));

  const usage = await usageByVersion(versionRows.map((v) => v.id));

  const families: SchemaFamily[] = schemaRows.map((schema) => {
    const versions = versionRows.filter((v) => v.schemaId === schema.id);
    const versionSummaries: SchemaVersionSummary[] = versions.map((v) => ({
      versionId: v.id,
      version: v.version,
      status: v.status === "published" ? "published" : "draft",
      adHoc: v.adHoc,
      documentCount: usage.get(v.id)?.documentCount ?? 0,
      createdAt: v.createdAt.toISOString(),
    }));
    const documentCount = versionSummaries.reduce((sum, v) => sum + v.documentCount, 0);
    const usedAt = versions
      .map((version) => usage.get(version.id)?.lastUsedAt?.getTime() ?? 0)
      .filter((value) => value > 0);
    const lastUsedAt = usedAt.length > 0 ? Math.max(...usedAt) : null;
    return {
      key: schema.key,
      name: schema.name,
      builtIn: schema.builtIn,
      documentCount,
      lastUsedAt: lastUsedAt ? new Date(lastUsedAt).toISOString() : null,
      versions: versionSummaries,
    };
  });

  families.sort((a, b) => {
    if (a.builtIn !== b.builtIn) return a.builtIn ? -1 : 1;
    if (a.documentCount !== b.documentCount) return b.documentCount - a.documentCount;
    const used = (b.lastUsedAt ? Date.parse(b.lastUsedAt) : 0) - (a.lastUsedAt ? Date.parse(a.lastUsedAt) : 0);
    return used || a.name.localeCompare(b.name);
  });

  return { families };
}

export async function getSchemaVersion(versionId: string): Promise<SchemaVersionDetail> {
  const db = getDb();
  const [version] = await db
    .select()
    .from(documentSchemaVersions)
    .where(eq(documentSchemaVersions.id, versionId))
    .limit(1);
  if (!version) throw notFound("Schema version not found.");
  const [schema] = await db
    .select()
    .from(documentSchemas)
    .where(eq(documentSchemas.id, version.schemaId))
    .limit(1);
  if (!schema) throw notFound("Schema not found.");

  return {
    key: schema.key,
    name: schema.name,
    versionId: version.id,
    version: version.version,
    status: version.status === "published" ? "published" : "draft",
    adHoc: version.adHoc,
    fields: version.definition as SchemaFieldDef[],
  };
}

/** Resolve a schema version into the extractor/review schema-tree contract. */
export async function getSchemaTreeByVersionId(versionId: string): Promise<SchemaTree> {
  const detail = await getSchemaVersion(versionId);
  return {
    key: detail.key,
    name: detail.name,
    version: detail.version,
    status: detail.status,
    adHoc: detail.adHoc,
    fields: detail.fields,
  };
}

function fieldKeysForMatch(fields: SchemaFieldDef[], prefix = ""): Set<string> {
  const keys = new Set<string>();
  for (const field of fields) {
    const path = prefix ? `${prefix}.${field.key}` : field.key;
    if (field.nodeKind === "scalar") {
      keys.add(slugKey(path));
      keys.add(slugKey(field.label));
    }
    if (field.nodeKind === "object") {
      for (const key of fieldKeysForMatch(field.children ?? [], path)) keys.add(key);
    }
    if (field.nodeKind === "array") {
      for (const child of field.item?.children ?? []) {
        if (child.nodeKind !== "scalar") continue;
        keys.add(slugKey(`${field.key}.${child.key}`));
        keys.add(slugKey(child.label));
      }
    }
  }
  return keys;
}

function schemaMatchScore(inferred: SchemaTree, candidate: SchemaTree): { score: number; overlap: number } {
  const inferredKeys = fieldKeysForMatch(inferred.fields);
  const candidateKeys = fieldKeysForMatch(candidate.fields);
  let overlap = 0;
  for (const key of inferredKeys) {
    if (candidateKeys.has(key)) overlap += 1;
  }
  if (inferredKeys.size === 0 || candidateKeys.size === 0) return { score: 0, overlap };
  const precision = overlap / inferredKeys.size;
  const recall = overlap / candidateKeys.size;
  const nameBoost =
    slugKey(inferred.name) === slugKey(candidate.name) ||
    slugKey(inferred.key) === slugKey(candidate.key)
      ? 0.1
      : 0;
  return { score: Math.min(1, recall * 0.65 + precision * 0.35 + nameBoost), overlap };
}

export interface PublishedSchemaMatch {
  schemaVersionId: string;
  schema: SchemaTree;
  score: number;
  overlap: number;
}

/**
 * Find a reusable published schema for an inferred generic shape. This is a
 * conservative classifier: weak matches keep the document on its ad-hoc draft.
 */
export async function findBestPublishedSchemaMatch(
  inferred: SchemaTree,
  opts: { minScore?: number; minOverlap?: number } = {},
): Promise<PublishedSchemaMatch | null> {
  await ensureBuiltInSchemas();
  const minScore = opts.minScore ?? 0.6;
  const minOverlap = opts.minOverlap ?? 2;
  const db = getDb();
  const rows = await db
    .select({
      schemaKey: documentSchemas.key,
      schemaName: documentSchemas.name,
      versionId: documentSchemaVersions.id,
      version: documentSchemaVersions.version,
      adHoc: documentSchemaVersions.adHoc,
      definition: documentSchemaVersions.definition,
    })
    .from(documentSchemaVersions)
    .innerJoin(documentSchemas, eq(documentSchemas.id, documentSchemaVersions.schemaId))
    .where(eq(documentSchemaVersions.status, "published"));

  let best: PublishedSchemaMatch | null = null;
  for (const row of rows) {
    const schema: SchemaTree = {
      key: row.schemaKey,
      name: row.schemaName,
      version: row.version,
      status: "published",
      adHoc: row.adHoc,
      fields: row.definition as SchemaFieldDef[],
    };
    const { score, overlap } = schemaMatchScore(inferred, schema);
    if (overlap < minOverlap || score < minScore) continue;
    if (!best || score > best.score) {
      best = { schemaVersionId: row.versionId, schema, score, overlap };
    }
  }
  return best;
}

/** Create a new schema family with an editable draft version. */
export async function createSchemaDraft(args: {
  key?: string;
  name: string;
  fields?: SchemaFieldDef[];
  adHoc?: boolean;
}): Promise<SchemaVersionDetail> {
  const db = getDb();
  const key = slugKey(args.key ?? args.name);
  const fields = args.fields ?? [];
  assertValidFields(fields);
  const [version] = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: documentSchemas.id })
      .from(documentSchemas)
      .where(eq(documentSchemas.key, key))
      .limit(1);
    let schemaId = existing?.id;
    if (!schemaId) {
      const [schema] = await tx
        .insert(documentSchemas)
        .values({ key, name: args.name, builtIn: false })
        .returning({ id: documentSchemas.id });
      schemaId = schema!.id;
    }

    const [draft] = await tx
      .insert(documentSchemaVersions)
      .values({
        schemaId,
        version: "draft",
        status: "draft",
        adHoc: args.adHoc ?? false,
        definition: fields,
      })
      .onConflictDoUpdate({
        target: [documentSchemaVersions.schemaId, documentSchemaVersions.version],
        set: { definition: fields, revision: sql`${documentSchemaVersions.revision} + 1` },
      })
      .returning({ id: documentSchemaVersions.id });
    return [draft!];
  });
  return getSchemaVersion(version.id);
}

/** Replace the field definition of a draft version (published are immutable). */
export async function updateSchemaDraft(
  versionId: string,
  fields: SchemaFieldDef[],
): Promise<SchemaVersionDetail> {
  const db = getDb();
  const [version] = await db
    .select()
    .from(documentSchemaVersions)
    .where(eq(documentSchemaVersions.id, versionId))
    .limit(1);
  if (!version) throw notFound("Schema version not found.");
  if (version.status === "published") {
    throw new AppError({
      code: ERROR_CODES.SCHEMA_PUBLISHED,
      status: 409,
      title: "Published schema is immutable",
      detail: "Published schema versions cannot be edited. Create a new version instead.",
    });
  }
  assertValidFields(fields);
  await db
    .update(documentSchemaVersions)
    .set({ definition: fields, revision: version.revision + 1 })
    .where(eq(documentSchemaVersions.id, versionId));
  return getSchemaVersion(versionId);
}

/** Freeze a draft version as published (immutable, reusable). */
export async function publishSchema(versionId: string): Promise<SchemaVersionDetail> {
  const db = getDb();
  const [version] = await db
    .select()
    .from(documentSchemaVersions)
    .where(eq(documentSchemaVersions.id, versionId))
    .limit(1);
  if (!version) throw notFound("Schema version not found.");
  if (version.status === "published") return getSchemaVersion(versionId);

  const fields = version.definition as SchemaFieldDef[];
  assertValidFields(fields, true);
  const siblings = await db
    .select({ version: documentSchemaVersions.version })
    .from(documentSchemaVersions)
    .where(eq(documentSchemaVersions.schemaId, version.schemaId));
  const highest = siblings.reduce((max, sibling) => {
    const match = /^v(\d+)$/u.exec(sibling.version);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  const publishedVersion = `v${highest + 1}`;

  await db
    .update(documentSchemaVersions)
    .set({ version: publishedVersion, status: "published", adHoc: false })
    .where(and(eq(documentSchemaVersions.id, versionId), eq(documentSchemaVersions.status, "draft")));
  return getSchemaVersion(versionId);
}
