ALTER TYPE "public"."field_type" ADD VALUE 'text' BEFORE 'decimal';--> statement-breakpoint
ALTER TYPE "public"."field_type" ADD VALUE 'integer' BEFORE 'decimal';--> statement-breakpoint
ALTER TYPE "public"."field_type" ADD VALUE 'datetime' BEFORE 'currency';--> statement-breakpoint
ALTER TYPE "public"."field_type" ADD VALUE 'boolean' BEFORE 'currency';--> statement-breakpoint
CREATE TABLE "document_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"actor" text,
	"extraction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_parses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"source_kind" text NOT NULL,
	"text" text NOT NULL,
	"blocks" jsonb NOT NULL,
	"pages" jsonb NOT NULL,
	"parser_version" text NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_schema_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schema_id" uuid NOT NULL,
	"version" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"ad_hoc" boolean DEFAULT false NOT NULL,
	"definition" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_schemas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"built_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_references" ALTER COLUMN "page" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "schema_name" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "source_kind" text DEFAULT 'pdf' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "last_approved_extraction_id" uuid;--> statement-breakpoint
ALTER TABLE "extraction_fields" ADD COLUMN "schema_field_key" text;--> statement-breakpoint
ALTER TABLE "extraction_fields" ADD COLUMN "node_kind" text DEFAULT 'scalar' NOT NULL;--> statement-breakpoint
ALTER TABLE "extraction_fields" ADD COLUMN "presence_state" text DEFAULT 'present' NOT NULL;--> statement-breakpoint
ALTER TABLE "extraction_fields" ADD COLUMN "value_origin" text DEFAULT 'extracted' NOT NULL;--> statement-breakpoint
ALTER TABLE "extraction_fields" ADD COLUMN "value_text" text;--> statement-breakpoint
ALTER TABLE "extraction_fields" ADD COLUMN "value_numeric" numeric(38, 6);--> statement-breakpoint
ALTER TABLE "extraction_fields" ADD COLUMN "value_date" text;--> statement-breakpoint
ALTER TABLE "extraction_fields" ADD COLUMN "value_boolean" boolean;--> statement-breakpoint
ALTER TABLE "extraction_fields" ADD COLUMN "parse_confidence" real;--> statement-breakpoint
ALTER TABLE "extractions" ADD COLUMN "schema_key" text;--> statement-breakpoint
ALTER TABLE "extractions" ADD COLUMN "schema_version_id" uuid;--> statement-breakpoint
ALTER TABLE "extractions" ADD COLUMN "parse_id" uuid;--> statement-breakpoint
ALTER TABLE "extractions" ADD COLUMN "parent_extraction_id" uuid;--> statement-breakpoint
ALTER TABLE "extractions" ADD COLUMN "extractor_key" text DEFAULT 'fixture' NOT NULL;--> statement-breakpoint
ALTER TABLE "extractions" ADD COLUMN "provider_model" text;--> statement-breakpoint
ALTER TABLE "extractions" ADD COLUMN "source_kind" text DEFAULT 'pdf' NOT NULL;--> statement-breakpoint
ALTER TABLE "extractions" ADD COLUMN "status_note" text;--> statement-breakpoint
ALTER TABLE "source_references" ADD COLUMN "offset_start" integer;--> statement-breakpoint
ALTER TABLE "source_references" ADD COLUMN "offset_end" integer;--> statement-breakpoint
ALTER TABLE "source_references" ADD COLUMN "grounding_status" text DEFAULT 'grounded' NOT NULL;--> statement-breakpoint
ALTER TABLE "source_references" ADD COLUMN "regions" jsonb;--> statement-breakpoint
ALTER TABLE "document_events" ADD CONSTRAINT "document_events_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_parses" ADD CONSTRAINT "document_parses_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_schema_versions" ADD CONSTRAINT "document_schema_versions_schema_id_document_schemas_id_fk" FOREIGN KEY ("schema_id") REFERENCES "public"."document_schemas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_events_document_id_idx" ON "document_events" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_parses_document_id_idx" ON "document_parses" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_schema_versions_key" ON "document_schema_versions" USING btree ("schema_id","version");--> statement-breakpoint
CREATE INDEX "document_schema_versions_schema_id_idx" ON "document_schema_versions" USING btree ("schema_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_schemas_key_key" ON "document_schemas" USING btree ("key");--> statement-breakpoint
CREATE INDEX "extraction_fields_schema_field_idx" ON "extraction_fields" USING btree ("schema_field_key");--> statement-breakpoint
CREATE INDEX "extraction_fields_value_text_idx" ON "extraction_fields" USING btree ("value_text");--> statement-breakpoint
CREATE INDEX "extraction_fields_value_numeric_idx" ON "extraction_fields" USING btree ("value_numeric");