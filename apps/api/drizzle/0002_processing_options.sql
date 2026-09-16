ALTER TABLE "processing_attempts" ADD COLUMN "mode" text DEFAULT 'initial' NOT NULL;
ALTER TABLE "processing_attempts" ADD COLUMN "schema_version_id" uuid;
ALTER TABLE "processing_attempts" ADD COLUMN "force_reparse" boolean DEFAULT false NOT NULL;
