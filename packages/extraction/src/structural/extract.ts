import type {
  ConfidenceState,
  SchemaFieldDef,
  SchemaTree,
} from "@invoice/contracts";
import { GENERIC_DOCUMENT_TYPE } from "@invoice/contracts";
import type { CanonicalParse, CanonicalTable } from "../canonical.js";
import type {
  ExtractedFieldValue,
  ExtractionResult,
  ExtractionStatus,
  QualityMetrics,
} from "../interfaces.js";
import { spanForTableCell, spanFromOffsets } from "./grounding.js";
import { extractNarrativeFields, extractResumeFields, shouldExtractNarrative } from "./narrative-sections.js";
import { humanizeLabel, inferColumnType, inferType, normalizeValue, slugKey } from "../typing.js";

function confidenceStateFor(score: number): ConfidenceState {
  if (score >= 0.85) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}

/** Nearest preceding heading label for an offset (used to group scalar fields). */
function sectionForOffset(parse: CanonicalParse, offset: number): string {
  let heading: string | null = null;
  for (const block of parse.blocks) {
    if (block.kind === "heading" && block.offsetStart <= offset) heading = block.text;
    else if (block.offsetStart > offset) break;
  }
  return heading ? slugKey(heading) : "details";
}

function labelForSection(slug: string): string {
  return slug === "details" ? "Details" : humanizeLabel(slug);
}

function fieldImportance(key: string, label: string, type: SchemaFieldDef["type"]): { required: boolean; material: boolean } {
  const text = `${key} ${label}`.toLowerCase();
  const important =
    /\b(name|title|owner|customer|client|company|project|ticket|status|priority|date|budget|currency|total|amount|hours)\b/u
      .test(text);
  const material = important || type === "decimal" || type === "integer" || type === "currency" || type === "date";
  return {
    required: important && type !== "text",
    material,
  };
}

/** Choose a stable array key from a preceding heading or fall back to items/records. */
function arrayKeyFor(parse: CanonicalParse, table: CanonicalTable, index: number): { key: string; label: string } {
  let heading: string | null = null;
  for (const block of parse.blocks) {
    if (block.kind === "heading" && block.offsetStart <= table.offsetStart) heading = block.text;
    else if (block.offsetStart > table.offsetStart) break;
  }
  if (heading) {
    const key = slugKey(heading);
    return { key, label: humanizeLabel(heading) };
  }
  return index === 0 ? { key: "records", label: "Records" } : { key: `table${index + 1}`, label: `Table ${index + 1}` };
}

function usableColumns(table: CanonicalTable): number[] {
  const cols: number[] = [];
  table.headers.forEach((h, i) => {
    if (h.trim().length > 0) cols.push(i);
  });
  return cols.length > 0 ? cols : table.headers.map((_, i) => i);
}

/**
 * The deterministic StructuralExtractor. It infers an ad-hoc schema and extracts
 * values from the canonical parse without any provider cost: labeled key/value
 * pairs become scalar fields, detected tables become arrays of objects,
 * heading-scoped prose and bullet lists become text and record arrays, and a
 * low-structure document falls back to a single reviewable content field
 * (explicitly marked degraded).
 */
export function extractStructural(parse: CanonicalParse): ExtractionResult {
  const fields: ExtractedFieldValue[] = [];
  const schemaFields: SchemaFieldDef[] = [];
  const usedKeys = new Set<string>();

  const uniqueKey = (base: string): string => {
    let key = base || "field";
    let n = 2;
    while (usedKeys.has(key)) {
      key = `${base}${n}`;
      n += 1;
    }
    usedKeys.add(key);
    return key;
  };

  const resume = extractResumeFields(parse);
  if (resume) {
    const quality = computeQuality(resume.fields);
    return {
      schema: {
        key: "resume",
        name: "Resume",
        version: "draft",
        status: "draft",
        adHoc: true,
        fields: resume.schemaFields,
      },
      fields: resume.fields,
      status: quality.usableRatio >= 0.5 ? "succeeded" : "partial",
      statusNote:
        quality.usableRatio >= 0.5
          ? null
          : "Resume text was parsed into a generalized schema, but some sections need review.",
      presentSections: resume.presentSections,
      quality,
      extractorKey: "structural",
    };
  }

  // --- Scalar fields from key/value pairs ---
  for (const kv of parse.keyValues) {
    const base = slugKey(kv.key);
    const key = uniqueKey(base);
    const type = inferType(kv.value);
    const group = sectionForOffset(parse, kv.valueOffsetStart);
    const score = type === "text" ? 0.7 : 0.9;
    const importance = fieldImportance(key, kv.key, type);
    schemaFields.push({
      key,
      label: humanizeLabel(kv.key),
      type,
      nodeKind: "scalar",
      group,
      required: importance.required,
      material: importance.material,
      isSummary: schemaFields.filter((f) => f.nodeKind === "scalar").length < 4,
    });
    fields.push({
      schemaFieldKey: key,
      path: key,
      label: humanizeLabel(kv.key),
      group,
      type,
      nodeKind: "scalar",
      required: importance.required,
      material: importance.material,
      presenceState: "present",
      valueOrigin: "extracted",
      value: normalizeValue(type, kv.value),
      confidenceScore: score,
      confidenceState: confidenceStateFor(score),
      confidenceReason: "Labeled value detected in the document.",
      parseConfidence: parse.sourceKind === "pdf" ? 0.9 : 1,
      sources: [spanFromOffsets(parse, kv.valueOffsetStart, kv.valueOffsetEnd)],
    });
  }

  // --- Array fields from tables ---
  parse.tables.forEach((table, tIndex) => {
    const cols = usableColumns(table);
    if (table.rows.length === 0 || cols.length < 1) return;
    const { key: arrayBase, label: arrayLabel } = arrayKeyFor(parse, table, tIndex);
    const arrayKey = uniqueKey(arrayBase);

    const colKeys = new Set<string>();
    const colDefs: SchemaFieldDef[] = cols.map((c) => {
      const header = table.headers[c]?.trim() || `column${c + 1}`;
      let ck = slugKey(header);
      let n = 2;
      while (colKeys.has(ck)) {
        ck = `${slugKey(header)}${n}`;
        n += 1;
      }
      colKeys.add(ck);
      const colValues = table.rows.map((r) => r[c] ?? "");
      const type = inferColumnType(colValues);
      const importance = fieldImportance(ck, header, type);
      return {
        key: ck,
        label: humanizeLabel(header),
        type,
        nodeKind: "scalar" as const,
        group: arrayKey,
        required: importance.required && colValues.every((v) => v.trim().length > 0),
        material: importance.material,
      };
    });

    schemaFields.push({
      key: arrayKey,
      label: arrayLabel,
      type: "array",
      nodeKind: "array",
      group: arrayKey,
      required: false,
      material: false,
      item: { key: `${arrayKey}Item`, label: `${arrayLabel} item`, type: "object", nodeKind: "object", group: arrayKey, required: false, material: false, children: colDefs },
    });

    table.rows.forEach((row, rowIndex) => {
      cols.forEach((c, ci) => {
        const def = colDefs[ci]!;
        const cell = (row[c] ?? "").trim();
        const score = 0.85;
        fields.push({
          schemaFieldKey: `${arrayKey}[].${def.key}`,
          path: `${arrayKey}[${rowIndex}].${def.key}`,
          label: def.label,
          group: arrayKey,
          type: def.type,
          nodeKind: "scalar",
          required: false,
          material: false,
          presenceState: cell.length > 0 ? "present" : "empty",
          valueOrigin: "extracted",
          value: cell.length > 0 ? normalizeValue(def.type, cell) : null,
          confidenceScore: score,
          confidenceState: confidenceStateFor(score),
          confidenceReason: "Cell from a detected table.",
          parseConfidence: parse.sourceKind === "pdf" ? 0.85 : 1,
          sources: cell.length > 0 ? [spanForTableCell(parse, table, rowIndex, c)] : [],
        });
      });
    });
  });

  // --- Narrative sections (headings + prose / lists) ---
  if (shouldExtractNarrative(parse)) {
    const narrative = extractNarrativeFields(parse, uniqueKey);
    schemaFields.push(...narrative.schemaFields);
    fields.push(...narrative.fields);
  }

  // --- Low-structure fallback ---
  const hasStructure = fields.length > 0;
  if (!hasStructure) {
    const firstHeading = parse.blocks.find((b) => b.kind === "heading");
    if (firstHeading) {
      schemaFields.push({ key: "title", label: "Title", type: "string", nodeKind: "scalar", group: "details", required: false, material: false, isSummary: true });
      fields.push({
        schemaFieldKey: "title",
        path: "title",
        label: "Title",
        group: "details",
        type: "string",
        nodeKind: "scalar",
        required: false,
        material: false,
        presenceState: "present",
        valueOrigin: "inferred",
        value: firstHeading.text,
        confidenceScore: 0.6,
        confidenceState: "medium",
        confidenceReason: "First heading in the document.",
        parseConfidence: 1,
        sources: [spanFromOffsets(parse, firstHeading.offsetStart, firstHeading.offsetEnd)],
      });
    }
    const excerpt = parse.text.slice(0, 4000);
    schemaFields.push({ key: "content", label: "Content", type: "text", nodeKind: "scalar", group: "details", required: false, material: false });
    fields.push({
      schemaFieldKey: "content",
      path: "content",
      label: "Content",
      group: "details",
      type: "text",
      nodeKind: "scalar",
      required: false,
      material: false,
      presenceState: "present",
      valueOrigin: "extracted",
      value: excerpt,
      confidenceScore: 0.45,
      confidenceState: "low",
      confidenceReason: "No labeled fields or tables were detected; captured raw text for review.",
      parseConfidence: 1,
      sources: [spanFromOffsets(parse, 0, Math.min(excerpt.length, parse.text.length))],
    });
  }

  const groups = [...new Set(schemaFields.map((f) => f.group))];
  const presentSections = groups.map((g) => labelForSection(g));

  const quality = computeQuality(fields);
  const status: ExtractionStatus = !hasStructure
    ? "degraded"
    : quality.usableRatio >= 0.5
      ? "succeeded"
      : "partial";
  const statusNote =
    status === "degraded"
      ? "This document has little detectable structure. The raw text is captured for review."
      : status === "partial"
        ? "Some values were extracted with low confidence — please verify."
        : null;

  const schema: SchemaTree = {
    key: `adhoc_${hashKey(schemaFields)}`,
    name: firstHeadingName(parse) ?? "Document",
    version: "draft",
    status: "draft",
    adHoc: true,
    fields: schemaFields,
  };

  return {
    schema,
    fields,
    status,
    statusNote,
    presentSections,
    quality,
    extractorKey: "structural",
  };
}

function kvForField(parse: CanonicalParse, field: SchemaFieldDef) {
  const keys = new Set([slugKey(field.key), slugKey(field.label)]);
  return parse.keyValues.find((kv) => keys.has(slugKey(kv.key))) ?? null;
}

function scalarFromSchema(
  parse: CanonicalParse,
  field: SchemaFieldDef,
  path = field.key,
  schemaFieldKey = field.key,
): ExtractedFieldValue {
  const kv = kvForField(parse, field);
  if (!kv) {
    return {
      schemaFieldKey,
      path,
      label: field.label,
      group: field.group,
      type: field.type,
      nodeKind: "scalar",
      required: field.required,
      material: field.material,
      presenceState: "not_found",
      valueOrigin: "extracted",
      value: null,
      confidenceScore: 0.2,
      confidenceState: "low",
      confidenceReason: "No matching labeled value was found for this schema field.",
      parseConfidence: parse.sourceKind === "pdf" ? 0.9 : 1,
      sources: [],
    };
  }
  const score = field.type === "text" ? 0.7 : 0.85;
  return {
    schemaFieldKey,
    path,
    label: field.label,
    group: field.group,
    type: field.type,
    nodeKind: "scalar",
    required: field.required,
    material: field.material,
    presenceState: "present",
    valueOrigin: "extracted",
    value: normalizeValue(field.type, kv.value),
    confidenceScore: score,
    confidenceState: confidenceStateFor(score),
    confidenceReason: "Labeled value matched to the selected schema.",
    parseConfidence: parse.sourceKind === "pdf" ? 0.9 : 1,
    sources: [spanFromOffsets(parse, kv.valueOffsetStart, kv.valueOffsetEnd)],
  };
}

function tableForArray(parse: CanonicalParse, field: SchemaFieldDef): CanonicalTable | null {
  const children = field.item?.children ?? [];
  if (children.length === 0) return null;
  const childKeys = new Set(children.flatMap((c) => [slugKey(c.key), slugKey(c.label)]));
  let best: { table: CanonicalTable; score: number } | null = null;
  for (const table of parse.tables) {
    const score = table.headers.filter((h) => childKeys.has(slugKey(h))).length;
    if (!best || score > best.score) best = { table, score };
  }
  return best && best.score > 0 ? best.table : null;
}

interface SchemaLeaf {
  schemaFieldKey: string;
  path: string;
  label: string;
  group: string;
  type: SchemaFieldDef["type"];
  required: boolean;
  material: boolean;
}

function isResumeSchema(schema: SchemaTree): boolean {
  const topLevel = new Set(schema.fields.map((field) => slugKey(field.key)));
  return (
    slugKey(schema.key) === "resume" ||
    slugKey(schema.name) === "resume" ||
    (topLevel.has("candidateName") && (topLevel.has("experience") || topLevel.has("education") || topLevel.has("skills")))
  );
}

function schemaLeaves(fields: SchemaFieldDef[], prefix = ""): Map<string, SchemaLeaf> {
  const leaves = new Map<string, SchemaLeaf>();
  for (const field of fields) {
    const path = prefix ? `${prefix}.${field.key}` : field.key;
    if (field.nodeKind === "scalar") {
      leaves.set(path, {
        schemaFieldKey: path,
        path,
        label: field.label,
        group: field.group,
        type: field.type,
        required: field.required,
        material: field.material,
      });
    }
    if (field.nodeKind === "object") {
      for (const [key, leaf] of schemaLeaves(field.children ?? [], path)) leaves.set(key, leaf);
    }
    if (field.nodeKind === "array") {
      for (const child of field.item?.children ?? []) {
        if (child.nodeKind !== "scalar") continue;
        const key = `${field.key}[].${child.key}`;
        leaves.set(key, {
          schemaFieldKey: key,
          path: key,
          label: child.label,
          group: field.group,
          type: child.type,
          required: child.required,
          material: child.material,
        });
      }
    }
  }
  return leaves;
}

function missingSchemaField(parse: CanonicalParse, leaf: SchemaLeaf): ExtractedFieldValue {
  return {
    schemaFieldKey: leaf.schemaFieldKey,
    path: leaf.path,
    label: leaf.label,
    group: leaf.group,
    type: leaf.type,
    nodeKind: "scalar",
    required: leaf.required,
    material: leaf.material,
    presenceState: "not_found",
    valueOrigin: "extracted",
    value: null,
    confidenceScore: 0.2,
    confidenceState: "low",
    confidenceReason: "No matching value was found for this schema field.",
    parseConfidence: parse.sourceKind === "pdf" ? 0.9 : 1,
    sources: [],
  };
}

function alignExtractedFieldsToSchema(
  parse: CanonicalParse,
  schema: SchemaTree,
  extracted: ExtractedFieldValue[],
): ExtractedFieldValue[] {
  const leaves = schemaLeaves(schema.fields);
  const fields: ExtractedFieldValue[] = [];
  const emittedTopLevel = new Set<string>();

  for (const field of extracted) {
    const leaf = leaves.get(field.schemaFieldKey) ?? leaves.get(field.path);
    if (!leaf) continue;
    if (!leaf.schemaFieldKey.includes("[].")) emittedTopLevel.add(leaf.schemaFieldKey);
    fields.push({
      ...field,
      schemaFieldKey: leaf.schemaFieldKey,
      label: leaf.label,
      group: leaf.group,
      type: leaf.type,
      required: leaf.required,
      material: leaf.material,
      value: normalizeValue(leaf.type, field.value),
    });
  }

  for (const leaf of leaves.values()) {
    if (!leaf.schemaFieldKey.includes("[].") && !emittedTopLevel.has(leaf.schemaFieldKey)) {
      fields.push(missingSchemaField(parse, leaf));
    }
  }

  return fields;
}

function resultFromSchemaFields(
  schema: SchemaTree,
  fields: ExtractedFieldValue[],
  partialNote: string,
): ExtractionResult {
  const quality = computeQuality(fields);
  const missingRequired = fields.some((f) => f.required && f.presenceState !== "present");
  const status: ExtractionStatus = missingRequired || quality.usableRatio < 0.5 ? "partial" : "succeeded";
  return {
    schema,
    fields,
    status,
    statusNote: status === "partial" ? partialNote : null,
    presentSections: [...new Set(fields.map((f) => labelForSection(f.group)))],
    quality,
    extractorKey: "structural",
  };
}

/** Extract using an explicit schema version selected by the user. */
export function extractStructuralWithSchema(parse: CanonicalParse, schema: SchemaTree): ExtractionResult {
  if (isResumeSchema(schema)) {
    const resume = extractResumeFields(parse);
    if (resume) {
      return resultFromSchemaFields(
        schema,
        alignExtractedFieldsToSchema(parse, schema, resume.fields),
        "The resume was re-extracted against the selected schema; some schema fields were not found.",
      );
    }
  }

  const fields: ExtractedFieldValue[] = [];
  for (const field of schema.fields) {
    if (field.nodeKind === "scalar") {
      fields.push(scalarFromSchema(parse, field));
      continue;
    }
    if (field.nodeKind === "object") {
      for (const child of field.children ?? []) {
        if (child.nodeKind === "scalar") {
          fields.push(scalarFromSchema(parse, child, `${field.key}.${child.key}`, `${field.key}.${child.key}`));
        }
      }
      continue;
    }
    if (field.nodeKind === "array") {
      const children = field.item?.children ?? [];
      const table = tableForArray(parse, field);
      if (!table) continue;
      const headerIndex = new Map(table.headers.map((h, i) => [slugKey(h), i]));
      table.rows.forEach((row, rowIndex) => {
        for (const child of children) {
          if (child.nodeKind !== "scalar") continue;
          const c = headerIndex.get(slugKey(child.key)) ?? headerIndex.get(slugKey(child.label));
          const raw = c === undefined ? "" : (row[c] ?? "");
          const present = raw.trim().length > 0;
          const key = `${field.key}[].${child.key}`;
          fields.push({
            schemaFieldKey: key,
            path: `${field.key}[${rowIndex}].${child.key}`,
            label: child.label,
            group: field.group,
            type: child.type,
            nodeKind: "scalar",
            required: child.required,
            material: child.material,
            presenceState: present ? "present" : "not_found",
            valueOrigin: "extracted",
            value: present ? normalizeValue(child.type, raw) : null,
            confidenceScore: present ? 0.85 : 0.2,
            confidenceState: present ? "high" : "low",
            confidenceReason: present
              ? "Table column matched to the selected schema."
              : "No matching table cell was found for this schema field.",
            parseConfidence: parse.sourceKind === "pdf" ? 0.85 : 1,
            sources: present ? [spanForTableCell(parse, table, rowIndex, c!)] : [],
          });
        }
      });
    }
  }

  return resultFromSchemaFields(
    schema,
    fields,
    "The document was re-extracted against the selected schema; some schema fields were not found.",
  );
}

function firstHeadingName(parse: CanonicalParse): string | null {
  const h = parse.blocks.find((b) => b.kind === "heading");
  return h ? h.text.slice(0, 40) : null;
}

function hashKey(fields: SchemaFieldDef[]): string {
  const basis = fields.map((f) => `${f.key}:${f.type}`).join("|");
  let hash = 0;
  for (let i = 0; i < basis.length; i += 1) {
    hash = (hash * 31 + basis.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

export function computeQuality(fields: ExtractedFieldValue[]): QualityMetrics {
  const leaves = fields.filter((f) => f.nodeKind === "scalar");
  const usable = leaves.filter(
    (f) =>
      f.presenceState === "present" &&
      (f.confidenceScore ?? 0) >= 0.75 &&
      f.sources.some((s) => s.groundingStatus === "grounded"),
  );
  const materialLeaves = leaves.filter((f) => f.required || f.material);
  const materialUsable = materialLeaves.filter((f) => usable.includes(f));
  const hasUsableTable = fields.some((f) => f.schemaFieldKey.includes("[].") && usable.includes(f));
  return {
    usableLeafCount: usable.length,
    totalLeafCount: leaves.length,
    usableRatio: leaves.length === 0 ? 0 : usable.length / leaves.length,
    hasUsableTable,
    requiredMaterialUsableRatio: materialLeaves.length === 0 ? 1 : materialUsable.length / materialLeaves.length,
    anyMaterialUnusable: materialLeaves.length > 0 && materialUsable.length < materialLeaves.length,
  };
}
