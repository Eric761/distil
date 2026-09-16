CREATE TABLE IF NOT EXISTS "document_records" (
  "document_id" uuid PRIMARY KEY NOT NULL REFERENCES "documents"("id") ON DELETE cascade,
  "extraction_id" uuid NOT NULL,
  "extraction_version" integer NOT NULL,
  "schema_key" text NOT NULL,
  "schema_version_id" uuid,
  "data" jsonb NOT NULL,
  "approved_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "document_records_schema_idx" ON "document_records" ("schema_key");
CREATE INDEX IF NOT EXISTS "document_records_approved_idx" ON "document_records" ("approved_at");
