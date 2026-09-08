import type {
  DocumentListResponse,
  DocumentSummary,
  ExtractionDetail,
  ExtractionField,
  LineItemRow,
  QueryResponse,
  ReviewQueueItem,
  ReviewQueueResponse,
} from "@invoice/contracts";

export const DOC_ID = "11111111-1111-4111-8111-111111111111";
export const EXTRACTION_ID = "22222222-2222-4222-8222-222222222222";

export function makeDocumentSummary(overrides: Partial<DocumentSummary> = {}): DocumentSummary {
  const base: DocumentSummary = {
    id: DOC_ID,
    originalFilename: "acme-office-supply-invoice.pdf",
    documentType: "invoice",
    sizeBytes: 42_000,
    processingStatus: "succeeded",
    reviewStatus: "needs_review",
    processingPhase: null,
    failureCode: null,
    failureMessage: null,
    vendorName: "Acme Office Supply Co.",
    invoiceNumber: "AC-2024-0912",
    total: "868.00",
    currency: "USD",
    openIssues: 0,
    createdAt: "2024-09-12T10:00:00.000Z",
    updatedAt: "2024-09-12T10:05:00.000Z",
  };
  return { ...base, ...overrides };
}

export function makeDocumentListResponse(overrides: Partial<DocumentListResponse> = {}): DocumentListResponse {
  const items = overrides.items ?? [makeDocumentSummary()];
  const base: DocumentListResponse = {
    items,
    pagination: {
      page: 1,
      pageSize: 10,
      total: items.length,
      totalPages: 1,
    },
    activeProcessingCount: 0,
  };
  return { ...base, ...overrides };
}

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

/** Build an ExtractionField with sensible, overridable defaults. */
export function makeField(overrides: Partial<ExtractionField> = {}): ExtractionField {
  const base: ExtractionField = {
    id: nextId("field"),
    path: "vendorName",
    label: "Vendor name",
    group: "identity",
    type: "string",
    required: false,
    material: false,
    extractedValue: "Acme Office Supply Co.",
    correctedValue: null,
    effectiveValue: "Acme Office Supply Co.",
    confidenceScore: 0.98,
    confidenceState: "high",
    confidenceReason: null,
    validationState: "valid",
    validationIssues: [],
    reviewState: "auto_accepted",
    correctedAt: null,
    needsAttention: false,
    sourceReferences: [
      { id: nextId("src"), page: 1, box: { x: 0.1, y: 0.1, width: 0.2, height: 0.05 }, sourceText: "Acme Office Supply Co.", candidateRank: null },
    ],
    conflictCandidates: [],
  };
  return { ...base, ...overrides };
}

/** A resolved line item (all four cells valid and auto-accepted). */
export function makeLineItem(position: number): LineItemRow {
  return {
    id: `line-${position}`,
    position,
    fields: {
      description: makeField({ path: `lineItems[${position}].description`, group: "lineItems", label: "Description", type: "string", extractedValue: "Widget", effectiveValue: "Widget" }),
      quantity: makeField({ path: `lineItems[${position}].quantity`, group: "lineItems", label: "Qty", type: "decimal", extractedValue: "2.00", effectiveValue: "2.00" }),
      unitPrice: makeField({ path: `lineItems[${position}].unitPrice`, group: "lineItems", label: "Unit price", type: "decimal", extractedValue: "10.00", effectiveValue: "10.00" }),
      lineTotal: makeField({ path: `lineItems[${position}].lineTotal`, group: "lineItems", label: "Line total", type: "decimal", extractedValue: "20.00", effectiveValue: "20.00" }),
    },
  };
}

export function makeDetail(overrides: Partial<ExtractionDetail> = {}): ExtractionDetail {
  const base: ExtractionDetail = {
    documentId: DOC_ID,
    extractionId: EXTRACTION_ID,
    version: 1,
    schemaVersion: "invoice.v1",
    status: "succeeded",
    presentSections: ["identity", "dates", "amounts", "lineItems", "metadata"],
    fields: [makeField()],
    lineItems: [makeLineItem(0)],
    progress: { totalAttentionFields: 0, resolvedAttentionFields: 0 },
    approvalBlockers: [],
    pages: [{ page: 1, widthPt: 612, heightPt: 792 }],
  };
  return { ...base, ...overrides };
}

export function makeReviewQueueItem(overrides: Partial<ReviewQueueItem> = {}): ReviewQueueItem {
  const base: ReviewQueueItem = {
    documentId: DOC_ID,
    originalFilename: "northstar.pdf",
    vendorName: "Northstar Logistics",
    invoiceNumber: "NS-4471",
    total: "1240.00",
    currency: "USD",
    processingStatus: "succeeded",
    reviewStatus: "needs_review",
    openIssueCount: 3,
    topIssue: {
      fieldPath: "total",
      label: "Total",
      confidenceState: "conflicting",
      validationState: "invalid",
      required: true,
      material: true,
      message: "Conflicting values found for Total — choose the correct one.",
    },
  };
  return { ...base, ...overrides };
}

export function makeReviewQueueResponse(
  overrides: Partial<ReviewQueueResponse> = {},
): ReviewQueueResponse {
  const items = overrides.items ?? [makeReviewQueueItem()];
  const base: ReviewQueueResponse = {
    items,
    totalDocuments: items.length,
    totalOpenIssues: items.reduce((sum, i) => sum + i.openIssueCount, 0),
  };
  return { ...base, ...overrides };
}

export function makeQueryResponse(overrides: Partial<QueryResponse> = {}): QueryResponse {
  const base: QueryResponse = {
    interpretation: {
      originalText: "USD invoices over 500",
      filters: { amount: { comparator: "gt", value: "500.00" }, currency: "USD" },
      chips: [
        { key: "amount", label: "Total", display: "> 500.00" },
        { key: "currency", label: "Currency", display: "USD" },
      ],
      unparsedTerms: [],
      warnings: [],
      needsClarification: false,
    },
    items: [
      {
        documentId: DOC_ID,
        vendorName: "Acme Office Supply Co.",
        invoiceNumber: "AC-2024-0912",
        invoiceDate: "2024-09-12",
        currency: "USD",
        total: "868.00",
        reviewStatus: "approved",
        openIssues: 0,
        totalSource: { documentId: DOC_ID, fieldPath: "total", page: 1, hasBox: true },
      },
    ],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    summary: { totalCount: 1, byCurrency: [{ currency: "USD", count: 1, total: "868.00" }] },
  };
  return { ...base, ...overrides };
}
