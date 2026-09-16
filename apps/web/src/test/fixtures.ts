import type {
  DocumentHistoryResponse,
  DocumentDetail,
  DocumentListResponse,
  DocumentSummary,
  ExtractionDetail,
  ExtractionField,
  QueryResponse,
  ReviewQueueItem,
  ReviewQueueResponse,
  SchemaListResponse,
  SchemaTree,
  SchemaVersionDetail,
} from "@invoice/contracts";

export const DOC_ID = "11111111-1111-4111-8111-111111111111";
export const EXTRACTION_ID = "22222222-2222-4222-8222-222222222222";
export const INVOICE_VERSION_ID = "33333333-3333-4333-8333-333333333333";
export const DRAFT_VERSION_ID = "44444444-4444-4444-8444-444444444444";

export function makeDocumentSummary(overrides: Partial<DocumentSummary> = {}): DocumentSummary {
  const base: DocumentSummary = {
    id: DOC_ID,
    originalFilename: "acme-office-supply-invoice.pdf",
    documentType: "invoice",
    documentFormat: "pdf",
    schemaName: "Invoice",
    sourceKind: "pdf",
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
    summaryValues: [],
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

export function makeDocumentDetail(overrides: Partial<DocumentDetail> = {}): DocumentDetail {
  const base: DocumentDetail = {
    summary: makeDocumentSummary(),
    latestAttempt: null,
    currentExtractionId: EXTRACTION_ID,
    canRetry: false,
    hasExtraction: true,
    approvedAt: null,
    invoiceRecord: null,
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
    schemaFieldKey: "vendorName",
    label: "Vendor name",
    group: "identity",
    type: "string",
    nodeKind: "scalar",
    required: false,
    material: false,
    extractedValue: "Acme Office Supply Co.",
    correctedValue: null,
    effectiveValue: "Acme Office Supply Co.",
    presenceState: "present",
    valueOrigin: "extracted",
    confidenceScore: 0.98,
    confidenceState: "high",
    confidenceReason: null,
    parseConfidence: 0.95,
    validationState: "valid",
    validationIssues: [],
    reviewState: "auto_accepted",
    correctedAt: null,
    needsAttention: false,
    sourceReferences: [
      {
        id: nextId("src"),
        page: 1,
        box: { x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
        offsetStart: null,
        offsetEnd: null,
        groundingStatus: "grounded",
        regions: [],
        sourceText: "Acme Office Supply Co.",
        candidateRank: null,
      },
    ],
    conflictCandidates: [],
  };
  return { ...base, ...overrides };
}

/** The four flat fields of a resolved line item (all valid and auto-accepted). */
export function makeLineItemFields(position: number): ExtractionField[] {
  const cell = (
    column: string,
    label: string,
    type: ExtractionField["type"],
    value: string,
  ): ExtractionField =>
    makeField({
      path: `lineItems[${position}].${column}`,
      schemaFieldKey: `lineItems[].${column}`,
      group: "lineItems",
      label,
      type,
      extractedValue: value,
      effectiveValue: value,
    });
  return [
    cell("description", "Description", "string", "Widget"),
    cell("quantity", "Qty", "decimal", "2.00"),
    cell("unitPrice", "Unit price", "decimal", "10.00"),
    cell("lineTotal", "Line total", "decimal", "20.00"),
  ];
}

const INVOICE_SCHEMA: SchemaTree = {
  key: "invoice",
  name: "Invoice",
  version: "v1",
  status: "published",
  adHoc: false,
  fields: [
    { key: "vendorName", label: "Vendor", type: "string", nodeKind: "scalar", group: "identity", required: true, material: false, isSummary: true },
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
        children: [],
      },
    },
  ],
};

export function makeDetail(overrides: Partial<ExtractionDetail> = {}): ExtractionDetail {
  const base: ExtractionDetail = {
    documentId: DOC_ID,
    extractionId: EXTRACTION_ID,
    version: 1,
    documentType: "invoice",
    schemaVersion: "invoice.v1",
    schemaVersionId: INVOICE_VERSION_ID,
    schema: INVOICE_SCHEMA,
    sourceKind: "pdf",
    status: "succeeded",
    presentSections: ["identity", "dates", "amounts", "lineItems", "metadata"],
    fields: [makeField(), ...makeLineItemFields(0)],
    data: {},
    progress: { totalAttentionFields: 0, resolvedAttentionFields: 0 },
    approvalBlockers: [],
    statusNote: null,
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

export function makeHistoryResponse(
  overrides: Partial<DocumentHistoryResponse> = {},
): DocumentHistoryResponse {
  const base: DocumentHistoryResponse = {
    events: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        kind: "uploaded",
        summary: "Document uploaded.",
        actor: null,
        extractionId: null,
        createdAt: "2024-09-12T10:00:00.000Z",
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        kind: "extraction_created",
        summary: "Extraction created.",
        actor: null,
        extractionId: EXTRACTION_ID,
        createdAt: "2024-09-12T10:01:00.000Z",
      },
    ],
  };
  return { ...base, ...overrides };
}

export function makeSchemaListResponse(
  overrides: Partial<SchemaListResponse> = {},
): SchemaListResponse {
  const base: SchemaListResponse = {
    families: [
      {
        key: "invoice",
        name: "Invoice",
        builtIn: true,
        documentCount: 9,
        lastUsedAt: "2024-09-12T10:05:00.000Z",
        versions: [
          {
            versionId: INVOICE_VERSION_ID,
            version: "v1",
            status: "published",
            adHoc: false,
            documentCount: 9,
            createdAt: "2024-09-01T00:00:00.000Z",
          },
        ],
      },
      {
        key: "adhoc_orbital",
        name: "Orbital Cloud Migration",
        builtIn: false,
        documentCount: 1,
        lastUsedAt: "2024-09-13T10:05:00.000Z",
        versions: [
          {
            versionId: DRAFT_VERSION_ID,
            version: "draft",
            status: "draft",
            adHoc: true,
            documentCount: 1,
            createdAt: "2024-09-13T00:00:00.000Z",
          },
        ],
      },
    ],
  };
  return { ...base, ...overrides };
}

export function makeSchemaVersionDetail(
  overrides: Partial<SchemaVersionDetail> = {},
): SchemaVersionDetail {
  const base: SchemaVersionDetail = {
    key: "adhoc_orbital",
    name: "Orbital Cloud Migration",
    versionId: DRAFT_VERSION_ID,
    version: "draft",
    status: "draft",
    adHoc: true,
    fields: [
      { key: "owner", label: "Owner", type: "string", nodeKind: "scalar", group: "details", required: false, material: false, isSummary: true },
      { key: "budget", label: "Budget", type: "integer", nodeKind: "scalar", group: "details", required: false, material: false },
    ],
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
        originalFilename: "acme-office-supply-invoice.pdf",
        documentType: "invoice",
        documentFormat: "pdf",
        schemaName: "Invoice",
        vendorName: "Acme Office Supply Co.",
        invoiceNumber: "AC-2024-0912",
        invoiceDate: "2024-09-12",
        currency: "USD",
        total: "868.00",
        summaryValues: [],
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
