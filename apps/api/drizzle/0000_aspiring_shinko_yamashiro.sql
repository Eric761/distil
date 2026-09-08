CREATE TYPE "public"."attempt_status" AS ENUM('queued', 'processing', 'succeeded', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."confidence_state" AS ENUM('high', 'medium', 'low', 'missing', 'conflicting', 'inferred');--> statement-breakpoint
CREATE TYPE "public"."field_type" AS ENUM('string', 'decimal', 'date', 'currency', 'enum', 'object', 'array');--> statement-breakpoint
CREATE TYPE "public"."processing_status" AS ENUM('uploaded', 'queued', 'processing', 'succeeded', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."review_field_state" AS ENUM('auto_accepted', 'needs_review', 'confirmed', 'corrected', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('not_ready', 'needs_review', 'ready', 'approved', 'reopened');--> statement-breakpoint
CREATE TYPE "public"."validation_state" AS ENUM('valid', 'invalid', 'warning', 'not_checked');--> statement-breakpoint
CREATE TABLE "document_files" (
	"document_id" uuid PRIMARY KEY NOT NULL,
	"content" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"document_type" text DEFAULT 'invoice' NOT NULL,
	"processing_status" "processing_status" DEFAULT 'uploaded' NOT NULL,
	"review_status" "review_status" DEFAULT 'not_ready' NOT NULL,
	"processing_phase" text,
	"failure_code" text,
	"failure_message" text,
	"current_extraction_id" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processing_started_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "extraction_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extraction_id" uuid NOT NULL,
	"path" text NOT NULL,
	"label" text NOT NULL,
	"field_group" text NOT NULL,
	"type" "field_type" NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"material" boolean DEFAULT false NOT NULL,
	"extracted_value" jsonb,
	"corrected_value" jsonb,
	"confidence_score" real,
	"confidence_state" "confidence_state" NOT NULL,
	"confidence_reason" text,
	"validation_state" "validation_state" DEFAULT 'not_checked' NOT NULL,
	"validation_issues" jsonb NOT NULL,
	"review_state" "review_field_state" DEFAULT 'needs_review' NOT NULL,
	"needs_attention" boolean DEFAULT true NOT NULL,
	"conflict_candidates" jsonb NOT NULL,
	"corrected_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extractions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"schema_version" text NOT NULL,
	"engine_version" text NOT NULL,
	"status" text NOT NULL,
	"present_sections" jsonb NOT NULL,
	"pages" jsonb NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extraction_id" uuid NOT NULL,
	"field_path" text NOT NULL,
	"action" text NOT NULL,
	"from_value" jsonb,
	"to_value" jsonb,
	"extraction_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_document_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"description" text,
	"quantity" numeric(18, 4),
	"unit_price" numeric(18, 4),
	"line_total" numeric(18, 2)
);
--> statement-breakpoint
CREATE TABLE "invoice_records" (
	"document_id" uuid PRIMARY KEY NOT NULL,
	"extraction_id" uuid NOT NULL,
	"extraction_version" integer NOT NULL,
	"vendor_name" text,
	"vendor_name_normalized" text,
	"invoice_number" text,
	"invoice_date" text,
	"due_date" text,
	"currency" text,
	"subtotal" numeric(18, 2),
	"tax" numeric(18, 2),
	"total" numeric(18, 2),
	"payment_terms" text,
	"approved_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processing_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" "attempt_status" DEFAULT 'queued' NOT NULL,
	"phase" text,
	"error_code" text,
	"error_message" text,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_references" (
	"id" text PRIMARY KEY NOT NULL,
	"field_id" uuid NOT NULL,
	"page" integer NOT NULL,
	"box" jsonb,
	"source_text" text NOT NULL,
	"candidate_rank" integer
);
--> statement-breakpoint
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_fields" ADD CONSTRAINT "extraction_fields_extraction_id_extractions_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."extractions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extractions" ADD CONSTRAINT "extractions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_corrections" ADD CONSTRAINT "field_corrections_extraction_id_extractions_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."extractions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_document_id_invoice_records_document_id_fk" FOREIGN KEY ("invoice_document_id") REFERENCES "public"."invoice_records"("document_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_records" ADD CONSTRAINT "invoice_records_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_attempts" ADD CONSTRAINT "processing_attempts_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_references" ADD CONSTRAINT "source_references_field_id_extraction_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."extraction_fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "documents_sha256_key" ON "documents" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "documents_processing_status_idx" ON "documents" USING btree ("processing_status");--> statement-breakpoint
CREATE INDEX "documents_review_status_idx" ON "documents" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "documents_created_at_idx" ON "documents" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "documents_filename_idx" ON "documents" USING btree ("original_filename");--> statement-breakpoint
CREATE UNIQUE INDEX "extraction_fields_path_key" ON "extraction_fields" USING btree ("extraction_id","path");--> statement-breakpoint
CREATE INDEX "extraction_fields_extraction_id_idx" ON "extraction_fields" USING btree ("extraction_id");--> statement-breakpoint
CREATE INDEX "extractions_document_id_idx" ON "extractions" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_line_items_position_key" ON "invoice_line_items" USING btree ("invoice_document_id","position");--> statement-breakpoint
CREATE INDEX "invoice_records_vendor_idx" ON "invoice_records" USING btree ("vendor_name_normalized");--> statement-breakpoint
CREATE INDEX "invoice_records_invoice_date_idx" ON "invoice_records" USING btree ("invoice_date");--> statement-breakpoint
CREATE INDEX "invoice_records_total_idx" ON "invoice_records" USING btree ("total");--> statement-breakpoint
CREATE INDEX "invoice_records_currency_idx" ON "invoice_records" USING btree ("currency");--> statement-breakpoint
CREATE INDEX "invoice_records_approved_at_idx" ON "invoice_records" USING btree ("approved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "processing_attempts_doc_attempt_key" ON "processing_attempts" USING btree ("document_id","attempt_number");--> statement-breakpoint
CREATE INDEX "processing_attempts_status_idx" ON "processing_attempts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "source_references_field_id_idx" ON "source_references" USING btree ("field_id");