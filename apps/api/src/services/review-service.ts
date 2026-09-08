import { and, asc, eq, inArray } from "drizzle-orm";
import {
  ERROR_CODES,
  type ApproveRequest,
  type ExtractionDetail,
  type ExtractionField,
  type LineItemRow,
  type SaveExtractionRequest,
  type SourceReference,
} from "@invoice/contracts";
import { getDb, type Database } from "../db/client.js";
import {
  documents,
  extractionFields,
  extractions,
  fieldCorrections,
  invoiceLineItems,
  invoiceRecords,
  sourceReferences,
  type ExtractionFieldRow,
} from "../db/schema.js";
import { AppError, notFound } from "../lib/errors.js";
import {
  approvalBlockers,
  computeNeedsAttention,
  docReviewStatus,
  effectiveValue,
  reviewProgress,
  validateFields,
  type FieldValidation,
  type WorkingField,
} from "../lib/validation.js";
import { buildNormalizedDraft, normalizedVendor } from "./processing-service.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

function toWorking(row: ExtractionFieldRow): WorkingField {
  return {
    id: row.id,
    path: row.path,
    group: row.fieldGroup,
    type: row.type,
    required: row.required,
    material: row.material,
    label: row.label,
    extractedValue: row.extractedValue ?? null,
    correctedValue: row.correctedValue ?? null,
    reviewState: row.reviewState,
    confidenceState: row.confidenceState,
  };
}

function mapField(
  row: ExtractionFieldRow,
  refs: SourceReference[],
  validation: FieldValidation,
  attention: boolean,
): ExtractionField {
  const working = toWorking(row);
  return {
    id: row.id,
    path: row.path,
    label: row.label,
    group: row.fieldGroup as ExtractionField["group"],
    type: row.type,
    required: row.required,
    material: row.material,
    extractedValue: row.extractedValue ?? null,
    correctedValue: row.correctedValue ?? null,
    effectiveValue: effectiveValue(working),
    confidenceScore: row.confidenceScore,
    confidenceState: row.confidenceState,
    confidenceReason: row.confidenceReason,
    validationState: validation.state,
    validationIssues: validation.issues,
    reviewState: row.reviewState,
    correctedAt: row.correctedAt ? row.correctedAt.toISOString() : null,
    needsAttention: attention,
    sourceReferences: refs,
    conflictCandidates: row.conflictCandidates,
  };
}

async function loadExtractionContext(documentId: string): Promise<{
  document: typeof documents.$inferSelect;
  extraction: typeof extractions.$inferSelect;
  rows: ExtractionFieldRow[];
  refsByField: Map<string, SourceReference[]>;
}> {
  const db = getDb();
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!doc) throw notFound("Document not found.");
  if (!doc.currentExtractionId) {
    throw new AppError({
      code: ERROR_CODES.EXTRACTION_NOT_READY,
      status: 409,
      title: "Not ready",
      detail: "This document has no extraction to review yet.",
      meta: { processingStatus: doc.processingStatus },
    });
  }

  const [extraction] = await db
    .select()
    .from(extractions)
    .where(eq(extractions.id, doc.currentExtractionId))
    .limit(1);
  if (!extraction) throw notFound("Extraction not found.");

  const rows = await db
    .select()
    .from(extractionFields)
    .where(eq(extractionFields.extractionId, extraction.id))
    .orderBy(asc(extractionFields.sortOrder));

  const fieldIds = rows.map((r) => r.id);
  const refs =
    fieldIds.length > 0
      ? await db.select().from(sourceReferences).where(inArray(sourceReferences.fieldId, fieldIds))
      : [];

  const refsByField = new Map<string, SourceReference[]>();
  for (const ref of refs) {
    const list = refsByField.get(ref.fieldId) ?? [];
    list.push({
      id: ref.id,
      page: ref.page,
      box: ref.box,
      sourceText: ref.sourceText,
      candidateRank: ref.candidateRank,
    });
    refsByField.set(ref.fieldId, list);
  }

  return { document: doc, extraction, rows, refsByField };
}

function assemble(
  context: Awaited<ReturnType<typeof loadExtractionContext>>,
): ExtractionDetail {
  const { document, extraction, rows, refsByField } = context;
  const working = rows.map(toWorking);
  const validations = validateFields(working);

  const fieldsDto: ExtractionField[] = [];
  const lineItemMap = new Map<number, Partial<LineItemRow["fields"]> & { position: number }>();

  for (const row of rows) {
    const validation = validations.get(row.id) ?? { state: "not_checked" as const, issues: [] };
    const attention = computeNeedsAttention(toWorking(row), validation);
    const dto = mapField(row, refsByField.get(row.id) ?? [], validation, attention);

    const lineMatch = /^lineItems\[(\d+)\]\.(description|quantity|unitPrice|lineTotal)$/u.exec(row.path);
    if (lineMatch) {
      const idx = Number(lineMatch[1]);
      const key = lineMatch[2] as keyof LineItemRow["fields"];
      const entry = lineItemMap.get(idx) ?? { position: idx };
      entry[key] = dto;
      lineItemMap.set(idx, entry);
    } else {
      fieldsDto.push(dto);
    }
  }

  const lineItems: LineItemRow[] = [...lineItemMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([, v]) => v.description && v.quantity && v.unitPrice && v.lineTotal)
    .map(([idx, v]) => ({
      id: `line-${idx}`,
      position: idx,
      fields: {
        description: v.description!,
        quantity: v.quantity!,
        unitPrice: v.unitPrice!,
        lineTotal: v.lineTotal!,
      },
    }));

  const blockers = approvalBlockers(working, validations);
  const progress = reviewProgress(working, validations);

  return {
    documentId: document.id,
    extractionId: extraction.id,
    version: extraction.version,
    schemaVersion: extraction.schemaVersion,
    status: extraction.status as "succeeded" | "partial",
    presentSections: extraction.presentSections as ExtractionDetail["presentSections"],
    fields: fieldsDto,
    lineItems,
    progress,
    approvalBlockers: blockers,
    pages: extraction.pages,
  };
}

export async function getExtractionDetail(documentId: string): Promise<ExtractionDetail> {
  const context = await loadExtractionContext(documentId);
  return assemble(context);
}

/** Recompute validations and persist derived field state + normalized record. */
async function persistDerived(
  tx: Tx,
  documentId: string,
  extractionId: string,
  version: number,
  working: WorkingField[],
  rows: ExtractionFieldRow[],
  approvedAt: Date | null,
): Promise<void> {
  const validations = validateFields(working);
  const byId = new Map(rows.map((r) => [r.id, r]));

  for (const wf of working) {
    const validation = validations.get(wf.id) ?? { state: "not_checked" as const, issues: [] };
    const attention = computeNeedsAttention(wf, validation);
    const row = byId.get(wf.id)!;
    await tx
      .update(extractionFields)
      .set({
        correctedValue: (wf.correctedValue ?? null) as object | null,
        reviewState: wf.reviewState,
        validationState: validation.state,
        validationIssues: validation.issues,
        needsAttention: attention,
        correctedAt: wf.reviewState === "corrected" ? (row.correctedAt ?? new Date()) : row.correctedAt,
      })
      .where(eq(extractionFields.id, wf.id));
  }

  // Rebuild the normalized record from effective values.
  const effectiveByPath = new Map<string, unknown | null>();
  for (const wf of working) effectiveByPath.set(wf.path, effectiveValue(wf));
  const draft = buildNormalizedDraft(effectiveByPath);

  await tx
    .update(invoiceRecords)
    .set({
      extractionVersion: version,
      vendorName: draft.vendorName,
      vendorNameNormalized: normalizedVendor(draft.vendorName),
      invoiceNumber: draft.invoiceNumber,
      invoiceDate: draft.invoiceDate,
      dueDate: draft.dueDate,
      currency: draft.currency,
      subtotal: draft.subtotal,
      tax: draft.tax,
      total: draft.total,
      paymentTerms: draft.paymentTerms,
      approvedAt,
      updatedAt: new Date(),
    })
    .where(eq(invoiceRecords.documentId, documentId));

  await tx.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceDocumentId, documentId));
  for (const li of draft.lineItems) {
    await tx.insert(invoiceLineItems).values({
      invoiceDocumentId: documentId,
      position: li.position,
      description: li.description,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      lineTotal: li.lineTotal,
    });
  }

  await tx
    .update(extractions)
    .set({ version })
    .where(eq(extractions.id, extractionId));
}

export async function saveExtraction(
  documentId: string,
  body: SaveExtractionRequest,
): Promise<ExtractionDetail> {
  const db = getDb();
  const context = await loadExtractionContext(documentId);

  if (context.extraction.version !== body.expectedVersion) {
    throw new AppError({
      code: ERROR_CODES.STALE_EXTRACTION_VERSION,
      status: 409,
      title: "Out of date",
      detail: "This extraction changed since you loaded it. Reload to see the latest values.",
      meta: { currentVersion: context.extraction.version },
    });
  }

  const rows = context.rows;
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const working = rows.map(toWorking);
  const workingById = new Map(working.map((w) => [w.id, w]));

  const corrections: Array<{ fieldPath: string; action: string; from: unknown; to: unknown }> = [];

  for (const change of body.changes) {
    const row = rowById.get(change.fieldId);
    const wf = workingById.get(change.fieldId);
    if (!row || !wf) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION_FAILED,
        status: 400,
        title: "Unknown field",
        detail: `Field ${change.fieldId} is not part of this extraction.`,
      });
    }

    const before = effectiveValue(wf);
    switch (change.action) {
      case "confirm":
        wf.reviewState = "confirmed";
        break;
      case "correct": {
        if (change.value === undefined) {
          throw new AppError({ code: ERROR_CODES.VALIDATION_FAILED, status: 400, title: "Missing value", detail: `A value is required to correct ${row.label}.` });
        }
        wf.correctedValue = change.value;
        wf.reviewState = "corrected";
        break;
      }
      case "not_applicable":
        if (row.required) {
          throw new AppError({ code: ERROR_CODES.VALIDATION_FAILED, status: 400, title: "Required field", detail: `${row.label} is required and cannot be marked not applicable.` });
        }
        wf.reviewState = "not_applicable";
        wf.correctedValue = null;
        break;
      case "resolve_conflict": {
        const candidate = row.conflictCandidates.find((c) => c.id === change.candidateId);
        if (!candidate) {
          throw new AppError({ code: ERROR_CODES.VALIDATION_FAILED, status: 400, title: "Unknown candidate", detail: `Candidate ${change.candidateId ?? ""} is not valid for ${row.label}.` });
        }
        wf.correctedValue = candidate.value;
        wf.reviewState = "corrected";
        break;
      }
      default:
        throw new AppError({ code: ERROR_CODES.VALIDATION_FAILED, status: 400, title: "Unknown action", detail: `Unsupported action for ${row.label}.` });
    }
    corrections.push({ fieldPath: row.path, action: change.action, from: before, to: effectiveValue(wf) });
  }

  const newVersion = context.extraction.version + 1;
  const wasApproved = context.document.reviewStatus === "approved";

  await db.transaction(async (tx) => {
    await persistDerived(tx, documentId, context.extraction.id, newVersion, working, rows, null);

    for (const c of corrections) {
      await tx.insert(fieldCorrections).values({
        extractionId: context.extraction.id,
        fieldPath: c.fieldPath,
        action: c.action,
        fromValue: (c.from ?? null) as object | null,
        toValue: (c.to ?? null) as object | null,
        extractionVersion: newVersion,
      });
    }

    const validations = validateFields(working);
    const blockers = approvalBlockers(working, validations);
    const reviewStatus = wasApproved ? "reopened" : docReviewStatus(blockers);

    await tx
      .update(documents)
      .set({ reviewStatus, approvedAt: wasApproved ? null : context.document.approvedAt, updatedAt: new Date() })
      .where(eq(documents.id, documentId));
  });

  return getExtractionDetail(documentId);
}

export async function approveDocument(
  documentId: string,
  body: ApproveRequest,
): Promise<ExtractionDetail> {
  const db = getDb();
  const context = await loadExtractionContext(documentId);

  if (context.extraction.version !== body.expectedVersion) {
    throw new AppError({
      code: ERROR_CODES.STALE_EXTRACTION_VERSION,
      status: 409,
      title: "Out of date",
      detail: "This extraction changed since you loaded it. Reload before approving.",
      meta: { currentVersion: context.extraction.version },
    });
  }

  const working = context.rows.map(toWorking);
  const validations = validateFields(working);
  const blockers = approvalBlockers(working, validations);

  if (blockers.length > 0) {
    throw new AppError({
      code: ERROR_CODES.APPROVAL_BLOCKED,
      status: 422,
      title: "Cannot approve yet",
      detail: "Resolve the highlighted fields before approving.",
      fieldErrors: blockers.map((b) => ({ path: b.path ?? "", message: b.message })),
      meta: { blockers },
    });
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    // Batch-accept any remaining auto-accepted fields explicitly.
    await tx
      .update(extractionFields)
      .set({ reviewState: "confirmed" })
      .where(and(eq(extractionFields.extractionId, context.extraction.id), eq(extractionFields.reviewState, "auto_accepted")));

    await tx
      .update(invoiceRecords)
      .set({ approvedAt: now, updatedAt: now })
      .where(eq(invoiceRecords.documentId, documentId));

    await tx
      .update(documents)
      .set({ reviewStatus: "approved", approvedAt: now, updatedAt: now })
      .where(eq(documents.id, documentId));
  });

  return getExtractionDetail(documentId);
}
