import {
  boolean,
  customType,
  integer,
  numeric,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  index,
  uuid,
} from "drizzle-orm/pg-core";

/** PostgreSQL bytea column for stored PDF bytes. */
const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});

/**
 * jsonb column that avoids double-parsing.
 *
 * The `postgres` driver already parses `json`/`jsonb` columns into JS values,
 * so Drizzle's built-in `jsonb` type parses a second time. That second parse
 * silently corrupts scalar values whose text is itself valid JSON — e.g. the
 * stored JSON string `"800.00"` becomes the number `800` — which breaks
 * decimal validation. Here `fromDriver` is the identity function (the value is
 * already parsed) while `toDriver` still serializes for insertion.
 */
const jsonb = customType<{ data: unknown; driverData: unknown }>({
  dataType() {
    return "jsonb";
  },
  toDriver(value: unknown): unknown {
    return JSON.stringify(value);
  },
  fromDriver(value: unknown): unknown {
    return value;
  },
});

export const processingStatusEnum = pgEnum("processing_status", [
  "uploaded",
  "queued",
  "processing",
  "succeeded",
  "partial",
  "failed",
]);

export const reviewStatusEnum = pgEnum("review_status", [
  "not_ready",
  "needs_review",
  "ready",
  "approved",
  "reopened",
]);

export const attemptStatusEnum = pgEnum("attempt_status", [
  "queued",
  "processing",
  "succeeded",
  "partial",
  "failed",
]);

export const confidenceStateEnum = pgEnum("confidence_state", [
  "high",
  "medium",
  "low",
  "missing",
  "conflicting",
  "inferred",
]);

export const validationStateEnum = pgEnum("validation_state", [
  "valid",
  "invalid",
  "warning",
  "not_checked",
]);

export const reviewFieldStateEnum = pgEnum("review_field_state", [
  "auto_accepted",
  "needs_review",
  "confirmed",
  "corrected",
  "not_applicable",
]);

export const fieldTypeEnum = pgEnum("field_type", [
  "string",
  "decimal",
  "date",
  "currency",
  "enum",
  "object",
  "array",
]);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    documentType: text("document_type").notNull().default("invoice"),
    processingStatus: processingStatusEnum("processing_status").notNull().default("uploaded"),
    reviewStatus: reviewStatusEnum("review_status").notNull().default("not_ready"),
    processingPhase: text("processing_phase"),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    currentExtractionId: uuid("current_extraction_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
  },
  (t) => ({
    sha256Idx: uniqueIndex("documents_sha256_key").on(t.sha256),
    processingIdx: index("documents_processing_status_idx").on(t.processingStatus),
    reviewIdx: index("documents_review_status_idx").on(t.reviewStatus),
    createdIdx: index("documents_created_at_idx").on(t.createdAt),
    filenameIdx: index("documents_filename_idx").on(t.originalFilename),
  }),
);

export const documentFiles = pgTable("document_files", {
  documentId: uuid("document_id")
    .primaryKey()
    .references(() => documents.id, { onDelete: "cascade" }),
  content: bytea("content").notNull(),
});

export const processingAttempts = pgTable(
  "processing_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    status: attemptStatusEnum("status").notNull().default("queued"),
    phase: text("phase"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    docAttemptIdx: uniqueIndex("processing_attempts_doc_attempt_key").on(t.documentId, t.attemptNumber),
    statusIdx: index("processing_attempts_status_idx").on(t.status),
  }),
);

export const extractions = pgTable(
  "extractions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    schemaVersion: text("schema_version").notNull(),
    engineVersion: text("engine_version").notNull(),
    status: text("status").notNull(), // "succeeded" | "partial"
    presentSections: jsonb("present_sections").notNull().$type<string[]>(),
    pages: jsonb("pages").notNull().$type<Array<{ page: number; widthPt: number; heightPt: number }>>(),
    rawPayload: jsonb("raw_payload").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    docIdx: index("extractions_document_id_idx").on(t.documentId),
  }),
);

export const extractionFields = pgTable(
  "extraction_fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    extractionId: uuid("extraction_id")
      .notNull()
      .references(() => extractions.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    label: text("label").notNull(),
    fieldGroup: text("field_group").notNull(),
    type: fieldTypeEnum("type").notNull(),
    required: boolean("required").notNull().default(false),
    material: boolean("material").notNull().default(false),
    extractedValue: jsonb("extracted_value"),
    correctedValue: jsonb("corrected_value"),
    confidenceScore: real("confidence_score"),
    confidenceState: confidenceStateEnum("confidence_state").notNull(),
    confidenceReason: text("confidence_reason"),
    validationState: validationStateEnum("validation_state").notNull().default("not_checked"),
    validationIssues: jsonb("validation_issues").notNull().$type<
      Array<{ severity: "error" | "warning"; message: string }>
    >(),
    reviewState: reviewFieldStateEnum("review_state").notNull().default("needs_review"),
    needsAttention: boolean("needs_attention").notNull().default(true),
    conflictCandidates: jsonb("conflict_candidates").notNull().$type<
      Array<{ id: string; label: string; value: unknown | null; sourceReferenceId: string | null }>
    >(),
    correctedAt: timestamp("corrected_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => ({
    extractionPathIdx: uniqueIndex("extraction_fields_path_key").on(t.extractionId, t.path),
    extractionIdx: index("extraction_fields_extraction_id_idx").on(t.extractionId),
  }),
);

export const sourceReferences = pgTable(
  "source_references",
  {
    id: text("id").primaryKey(),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => extractionFields.id, { onDelete: "cascade" }),
    page: integer("page").notNull(),
    box: jsonb("box").$type<{ x: number; y: number; width: number; height: number } | null>(),
    sourceText: text("source_text").notNull(),
    candidateRank: integer("candidate_rank"),
  },
  (t) => ({
    fieldIdx: index("source_references_field_id_idx").on(t.fieldId),
  }),
);

export const invoiceRecords = pgTable(
  "invoice_records",
  {
    documentId: uuid("document_id")
      .primaryKey()
      .references(() => documents.id, { onDelete: "cascade" }),
    extractionId: uuid("extraction_id").notNull(),
    extractionVersion: integer("extraction_version").notNull(),
    vendorName: text("vendor_name"),
    vendorNameNormalized: text("vendor_name_normalized"),
    invoiceNumber: text("invoice_number"),
    invoiceDate: text("invoice_date"),
    dueDate: text("due_date"),
    currency: text("currency"),
    subtotal: numeric("subtotal", { precision: 18, scale: 2 }),
    tax: numeric("tax", { precision: 18, scale: 2 }),
    total: numeric("total", { precision: 18, scale: 2 }),
    paymentTerms: text("payment_terms"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    vendorIdx: index("invoice_records_vendor_idx").on(t.vendorNameNormalized),
    invoiceDateIdx: index("invoice_records_invoice_date_idx").on(t.invoiceDate),
    totalIdx: index("invoice_records_total_idx").on(t.total),
    currencyIdx: index("invoice_records_currency_idx").on(t.currency),
    approvedIdx: index("invoice_records_approved_at_idx").on(t.approvedAt),
  }),
);

export const invoiceLineItems = pgTable(
  "invoice_line_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceDocumentId: uuid("invoice_document_id")
      .notNull()
      .references(() => invoiceRecords.documentId, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    description: text("description"),
    quantity: numeric("quantity", { precision: 18, scale: 4 }),
    unitPrice: numeric("unit_price", { precision: 18, scale: 4 }),
    lineTotal: numeric("line_total", { precision: 18, scale: 2 }),
  },
  (t) => ({
    positionIdx: uniqueIndex("invoice_line_items_position_key").on(t.invoiceDocumentId, t.position),
  }),
);

export const fieldCorrections = pgTable("field_corrections", {
  id: uuid("id").primaryKey().defaultRandom(),
  extractionId: uuid("extraction_id")
    .notNull()
    .references(() => extractions.id, { onDelete: "cascade" }),
  fieldPath: text("field_path").notNull(),
  action: text("action").notNull(),
  fromValue: jsonb("from_value"),
  toValue: jsonb("to_value"),
  extractionVersion: integer("extraction_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DocumentRow = typeof documents.$inferSelect;
export type ExtractionRow = typeof extractions.$inferSelect;
export type ExtractionFieldRow = typeof extractionFields.$inferSelect;
export type SourceReferenceRow = typeof sourceReferences.$inferSelect;
export type InvoiceRecordRow = typeof invoiceRecords.$inferSelect;
