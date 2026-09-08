import { createHash } from "node:crypto";
import type { BoundingBox, ConfidenceState, FieldType } from "@invoice/contracts";
import { fixtureDefinitions } from "./invoices.js";
import { renderInvoice } from "./render.js";
import type { AttemptOutcome, FieldSpec, RecordedBox, Section } from "./types.js";

export const SCHEMA_VERSION = "invoice.v1";

export interface ResolvedSourceReference {
  id: string;
  page: number;
  box: BoundingBox | null;
  sourceText: string;
  candidateRank: number | null;
}

export interface ResolvedConflictCandidate {
  id: string;
  label: string;
  value: unknown | null;
  sourceReferenceId: string | null;
}

export interface ResolvedField {
  path: string;
  label: string;
  group: Section;
  type: FieldType;
  required: boolean;
  material: boolean;
  extractedValue: unknown | null;
  confidenceScore: number | null;
  confidenceState: ConfidenceState;
  confidenceReason: string | null;
  sourceReferences: ResolvedSourceReference[];
  conflictCandidates: ResolvedConflictCandidate[];
}

export interface ResolvedProfile {
  fixtureId: string;
  filename: string;
  schemaVersion: string;
  descriptor: {
    title: string;
    vendorName: string;
    scenario: string;
    demonstrates: string;
  };
  processing: {
    phases: string[];
    attempts: AttemptOutcome[];
  };
  pages: Array<{ page: number; widthPt: number; heightPt: number }>;
  fields: ResolvedField[];
  expectedRecord: Record<string, string | null>;
  pdfBytes: Uint8Array;
  sha256: string;
}

function resolveField(spec: FieldSpec, boxes: Record<string, RecordedBox>): ResolvedField {
  const references: ResolvedSourceReference[] = [];
  const candidates: ResolvedConflictCandidate[] = [];

  if (spec.conflictCandidates && spec.conflictCandidates.length > 0) {
    spec.conflictCandidates.forEach((cand, index) => {
      let refId: string | null = null;
      if (cand.sourcePath) {
        const rec = boxes[cand.sourcePath];
        if (rec) {
          refId = `${spec.path}#src${index}`;
          references.push({
            id: refId,
            page: rec.page,
            box: rec.box,
            sourceText: rec.text,
            candidateRank: index,
          });
        }
      }
      candidates.push({
        id: cand.id,
        label: cand.label,
        value: cand.value,
        sourceReferenceId: refId,
      });
    });
  } else {
    const sourceKey = spec.sourcePath === undefined ? spec.path : spec.sourcePath;
    if (sourceKey) {
      const rec = boxes[sourceKey];
      if (rec) {
        references.push({
          id: `${spec.path}#src0`,
          page: rec.page,
          box: rec.box,
          sourceText: spec.sourceTextOverride ?? rec.text,
          candidateRank: null,
        });
      }
    }
  }

  return {
    path: spec.path,
    label: spec.label,
    group: spec.group,
    type: spec.type,
    required: spec.required,
    material: spec.material,
    extractedValue: spec.extractedValue,
    confidenceScore: spec.confidenceScore,
    confidenceState: spec.confidenceState,
    confidenceReason: spec.confidenceReason,
    sourceReferences: references,
    conflictCandidates: candidates,
  };
}

/**
 * Renders all fixture PDFs deterministically and resolves each field's
 * provenance boxes into concrete source references. Result is safe to seed.
 */
export async function buildFixtures(): Promise<ResolvedProfile[]> {
  const defs = fixtureDefinitions();
  const profiles: ResolvedProfile[] = [];

  for (const def of defs) {
    const rendered = await renderInvoice(def.layout);
    const fields = def.buildFields().map((f) => resolveField(f, rendered.boxes));
    const sha256 = createHash("sha256").update(rendered.pdfBytes).digest("hex");

    profiles.push({
      fixtureId: def.fixtureId,
      filename: def.filename,
      schemaVersion: SCHEMA_VERSION,
      descriptor: def.descriptor,
      processing: def.processing,
      pages: rendered.pages,
      fields,
      expectedRecord: def.expectedRecord,
      pdfBytes: rendered.pdfBytes,
      sha256,
    });
  }

  return profiles;
}

export type { AttemptOutcome, Section } from "./types.js";
