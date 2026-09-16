import type { FieldType, SchemaFieldDef } from "@invoice/contracts";
import type { CanonicalBlock, CanonicalParse } from "../canonical.js";
import type { ExtractedFieldValue } from "../interfaces.js";
import { spanFromOffsets } from "./grounding.js";
import { humanizeLabel, inferType, slugKey } from "../typing.js";

const NARRATIVE_KINDS = new Set<CanonicalBlock["kind"]>(["paragraph", "list-item", "line"]);

interface NarrativeSection {
  title: string | null;
  heading: CanonicalBlock | null;
  blocks: CanonicalBlock[];
}

type ResumeSectionKind = "summary" | "experience" | "education" | "skills" | "projects" | "achievements";

interface ResumeMajorSection {
  kind: ResumeSectionKind;
  heading: CanonicalBlock;
  blocks: CanonicalBlock[];
}

interface ResumeArrayColumn {
  key: string;
  label: string;
  type: FieldType;
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu;
const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,5}[\s.-]?\d{3,5}/u;
const LINKEDIN = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s|,;]+/iu;
const GITHUB = /(?:https?:\/\/)?(?:www\.)?github\.com\/[^\s|,;]+/iu;
const DATE_RANGE =
  /\b(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+)?(?:19|20)\d{2}\b\s*(?:[-–—]|to)\s*(?:Present|Current|(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+)?(?:19|20)\d{2})/iu;

function normalizeHeading(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
}

/** Document/template titles that must not become candidateName. */
function looksLikeResumeTemplateTitle(text: string): boolean {
  const h = normalizeHeading(text);
  if (!h) return false;
  if (/\b(curriculum vitae|cv)\b/u.test(h) && h.split(/\s+/u).length <= 5) return true;
  if (/\bresume\b/u.test(h) && /\b(sample|example|template|format|functional|chronological|combination)\b/u.test(h)) {
    return true;
  }
  if (/^(functional|chronological|combination|professional)\s+(resume|cv)$/u.test(h)) return true;
  if (/^resume\s+(sample|example|template)$/u.test(h)) return true;
  const words = h.split(/\s+/u);
  const last = words[words.length - 1];
  if ((last === "resume" || last === "cv") && words.length >= 2) return true;
  return false;
}

function looksLikeExperienceSectionTitle(text: string): boolean {
  const h = normalizeHeading(text);
  if (
    /^(work experience|professional experience|experience|employment|employment history|career history|work history|professional background|relevant experience|related experience|volunteer experience)$/u.test(
      h,
    )
  ) {
    return true;
  }
  if (/^(years|months|number|level|area|areas|field|fields)\s+of\s+experience$/u.test(h)) return false;
  if (/^(extensive|significant|demonstrated|proven|hands on|hands-on)\s+experience$/u.test(h)) return false;
  // Functional resumes: "Childcare Experience", "Industry Experience", etc.
  if (/^[a-z0-9][a-z0-9\s/&-]{0,42}\s+experience$/u.test(h) && h.split(/\s+/u).length <= 5) return true;
  return false;
}

function resumeSectionKind(text: string): ResumeSectionKind | null {
  const h = normalizeHeading(text);
  if (
    /^(summary|profile|objective|about|professional summary|career summary|executive summary|personal statement)$/u.test(
      h,
    )
  ) {
    return "summary";
  }
  if (looksLikeExperienceSectionTitle(text)) return "experience";
  if (/^(education|academic background|academics|training|qualifications)$/u.test(h)) return "education";
  if (/^(skills|technical skills|core skills|competencies|technologies|areas of expertise)$/u.test(h)) return "skills";
  if (/^(projects|project|selected projects|portfolio)$/u.test(h)) return "projects";
  if (
    /^(achievements|achievement|awards|awards and certificates|awards and certifications|certifications|certification|accomplishments|honors|honours)$/u.test(
      h,
    )
  ) {
    return "achievements";
  }
  return null;
}

function blockText(block: CanonicalBlock): string {
  return block.text.trim();
}

function blockSpan(parse: CanonicalParse, blocks: CanonicalBlock[]) {
  const usable = blocks.filter((b) => blockText(b).length > 0);
  if (usable.length === 0) return spanFromOffsets(parse, 0, 0);
  return spanFromOffsets(parse, usable[0]!.offsetStart, usable[usable.length - 1]!.offsetEnd);
}

function headingLooksLikePersonName(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 3 || trimmed.length > 60) return false;
  if (looksLikeResumeTemplateTitle(trimmed)) return false;
  if (/@|https?:|www\.|\d/u.test(trimmed)) return false;
  if (resumeSectionKind(trimmed)) return false;
  const words = trimmed.split(/\s+/u);
  if (words.length < 2 || words.length > 5) return false;
  return words.every((word) => /^[A-Z][A-Za-z.'-]*$/u.test(word) || /^[A-Z]\.$/u.test(word));
}

/** Prefer a person name on the line(s) above email/phone in the preamble. */
function personNameFromLine(text: string): string | null {
  const segments = text
    .split(/[|,;]/u)
    .map((part) => part.trim())
    .filter(Boolean);
  for (const segment of segments) {
    if (headingLooksLikePersonName(segment)) return segment;
  }
  return headingLooksLikePersonName(text) ? text.trim() : null;
}

function findCandidateNameBlock(preamble: CanonicalBlock[]): CanonicalBlock | null {
  const contactIdx = preamble.findIndex((block) => EMAIL.test(block.text) || PHONE.test(block.text));
  if (contactIdx >= 0) {
    for (let i = contactIdx - 1; i >= Math.max(0, contactIdx - 5); i -= 1) {
      const block = preamble[i]!;
      const name = personNameFromLine(blockText(block));
      if (name) return { ...block, text: name };
    }
    const contactName = personNameFromLine(blockText(preamble[contactIdx]!));
    if (contactName) return { ...preamble[contactIdx]!, text: contactName };
  }

  for (const block of preamble) {
    if (!["heading", "line", "paragraph"].includes(block.kind)) continue;
    const name = personNameFromLine(blockText(block));
    if (name) return { ...block, text: name };
  }
  return null;
}

function majorSectionFromBlock(block: CanonicalBlock): ResumeSectionKind | null {
  if (!["heading", "paragraph", "line"].includes(block.kind)) return null;
  const kind = resumeSectionKind(block.text);
  if (!kind) return null;
  // Body lines can repeat words like "Experience"; only section titles should start experience.
  if (kind === "experience" && block.kind !== "heading" && !looksLikeExperienceSectionTitle(block.text)) return null;
  return kind;
}

function coalesceAdjacentSections(sections: ResumeMajorSection[]): ResumeMajorSection[] {
  const merged: ResumeMajorSection[] = [];
  for (const section of sections) {
    const previous = merged[merged.length - 1];
    if (previous && previous.kind === section.kind) {
      previous.blocks.push(...section.blocks);
      continue;
    }
    merged.push(section);
  }
  return merged;
}

function splitResumeMajorSections(blocks: CanonicalBlock[]): {
  sections: ResumeMajorSection[];
  preamble: CanonicalBlock[];
} {
  const sections: ResumeMajorSection[] = [];
  const preamble: CanonicalBlock[] = [];
  let current: ResumeMajorSection | null = null;

  for (const block of blocks) {
    const kind = majorSectionFromBlock(block);
    if (kind) {
      current = { kind, heading: block, blocks: [] };
      sections.push(current);
      continue;
    }
    if (current) current.blocks.push(block);
    else preamble.push(block);
  }

  return { sections, preamble };
}

function isResumeLike(parse: CanonicalParse, sections: ResumeMajorSection[]): boolean {
  const kinds = new Set(sections.map((section) => section.kind));
  const hasEmail = EMAIL.test(parse.text);
  const strongSectionCount = ["experience", "education", "skills", "projects"].filter((kind) =>
    kinds.has(kind as ResumeSectionKind),
  ).length;
  return strongSectionCount >= 2 || (hasEmail && strongSectionCount >= 1);
}

function scalarDef(
  key: string,
  label: string,
  type: FieldType,
  group: string,
  opts: Partial<SchemaFieldDef> = {},
): SchemaFieldDef {
  return {
    key,
    label,
    type,
    nodeKind: "scalar",
    group,
    required: opts.required ?? false,
    material: opts.material ?? false,
    semanticKey: opts.semanticKey ?? null,
    isSummary: opts.isSummary ?? false,
  };
}

function arrayDef(key: string, label: string, columns: ResumeArrayColumn[]): SchemaFieldDef {
  return {
    key,
    label,
    type: "array",
    nodeKind: "array",
    group: key,
    required: false,
    material: false,
    item: {
      key: `${key}Item`,
      label: `${label} item`,
      type: "object",
      nodeKind: "object",
      group: key,
      required: false,
      material: false,
      children: columns.map((column) => scalarDef(column.key, column.label, column.type, key)),
    },
  };
}

function makeField(
  parse: CanonicalParse,
  key: string,
  label: string,
  type: FieldType,
  group: string,
  value: string,
  blocks: CanonicalBlock[],
  opts: Partial<ExtractedFieldValue> = {},
): ExtractedFieldValue {
  return {
    schemaFieldKey: key,
    path: key,
    label,
    group,
    type,
    nodeKind: "scalar",
    required: Boolean(opts.required),
    material: Boolean(opts.material),
    presenceState: "present",
    valueOrigin: "extracted",
    value,
    confidenceScore: opts.confidenceScore ?? 0.82,
    confidenceState: opts.confidenceState ?? "medium",
    confidenceReason: opts.confidenceReason ?? "Resume field inferred from a stable document section.",
    parseConfidence: parse.sourceKind === "pdf" ? 0.88 : 1,
    sources: opts.sources ?? [blockSpan(parse, blocks)],
  };
}

function makeRegexField(
  parse: CanonicalParse,
  key: string,
  label: string,
  value: string,
  index: number,
  opts: Partial<ExtractedFieldValue> = {},
): ExtractedFieldValue {
  return {
    schemaFieldKey: key,
    path: key,
    label,
    group: "contact",
    type: "string",
    nodeKind: "scalar",
    required: false,
    material: Boolean(opts.material),
    presenceState: "present",
    valueOrigin: "extracted",
    value,
    confidenceScore: opts.confidenceScore ?? 0.9,
    confidenceState: opts.confidenceState ?? "high",
    confidenceReason: "Contact detail detected with a deterministic pattern.",
    parseConfidence: parse.sourceKind === "pdf" ? 0.88 : 1,
    sources: [spanFromOffsets(parse, index, index + value.length)],
  };
}

function addArrayRow(
  parse: CanonicalParse,
  fields: ExtractedFieldValue[],
  arrayKey: string,
  rowIndex: number,
  values: Record<string, { label: string; type: FieldType; value: string; blocks: CanonicalBlock[] }>,
): void {
  for (const [columnKey, entry] of Object.entries(values)) {
    if (!entry.value.trim()) continue;
    fields.push({
      schemaFieldKey: `${arrayKey}[].${columnKey}`,
      path: `${arrayKey}[${rowIndex}].${columnKey}`,
      label: entry.label,
      group: arrayKey,
      type: entry.type,
      nodeKind: "scalar",
      required: false,
      material: false,
      presenceState: "present",
      valueOrigin: "extracted",
      value: entry.value.trim(),
      confidenceScore: 0.8,
      confidenceState: "medium",
      confidenceReason: "Resume row value inferred from a stable document section.",
      parseConfidence: parse.sourceKind === "pdf" ? 0.88 : 1,
      sources: [blockSpan(parse, entry.blocks)],
    });
  }
}

function sectionPlainText(blocks: CanonicalBlock[]): string {
  return blocks
    .filter((block) => block.kind !== "heading")
    .map(blockText)
    .filter(Boolean)
    .join("\n");
}

function looksLikeMisclassifiedProjectLabel(text: string): boolean {
  const normalized = text.trim();
  if (normalized.length === 0 || normalized.length > 48) return false;
  if (DATE_RANGE.test(normalized) || looksExperienceRoleLine(normalized)) return false;
  if (looksLikeOrganizationHeader(normalized, true)) return false;
  if (resumeSectionKind(normalized)) return false;
  const words = normalized.split(/\s+/u);
  if (words.length > 3) return false;
  return words.every((word) => /^[A-Z0-9][A-Za-z0-9+.#/&-]*$/u.test(word));
}

function splitExperienceEntries(section: ResumeMajorSection): Array<{ headers: CanonicalBlock[]; body: CanonicalBlock[] }> {
  const entries: Array<{ headers: CanonicalBlock[]; body: CanonicalBlock[] }> = [];
  let current: { headers: CanonicalBlock[]; body: CanonicalBlock[] } | null = null;

  const push = () => {
    if (current && (current.headers.length > 0 || current.body.length > 0)) entries.push(current);
    current = null;
  };

  const ensureCurrent = () => {
    if (!current) current = { headers: [], body: [] };
  };

  for (const block of section.blocks) {
    if (majorSectionFromBlock(block)) break;

    if (block.kind === "heading" && looksLikeMisclassifiedProjectLabel(block.text)) {
      ensureCurrent();
      current!.body.push(block);
      continue;
    }
    if (block.kind === "heading" && looksExperienceRoleLine(block.text)) {
      if (current?.body.length) push();
      ensureCurrent();
      current!.headers.push(block);
      continue;
    }
    if (block.kind === "heading") {
      if (current?.body.length) push();
      ensureCurrent();
      current!.headers.push(block);
      continue;
    }
    if (looksExperienceRoleLine(block.text)) {
      if (current?.body.length) push();
      ensureCurrent();
      current!.headers.push(block);
      continue;
    }
    if (["paragraph", "line", "list-item", "kv"].includes(block.kind)) {
      const text = blockText(block);
      if (!current && looksLikeOrganizationHeader(text, false)) {
        current = { headers: [block], body: [] };
        continue;
      }
      ensureCurrent();
      if (looksLikeMisclassifiedProjectLabel(text)) {
        current!.body.push(block);
        continue;
      }
      current!.body.push(block);
    }
  }
  push();
  return entries;
}

function looksLikeExperienceBulletOrProse(text: string): boolean {
  const normalized = text.trim();
  if (/^[-*•]\s/u.test(normalized)) return true;
  return /^(built|led|designed|implemented|providing|provided|developing|developed|created|maintained|worked|collaborated|optimized|improved|delivered|owned|managed|spearheaded|architected|automated|enhanced|reduced|increased|established|contributed|responsible|utilized|used|helped|supported|partnered)\b/iu.test(
    normalized,
  );
}

function experienceDateRangeAtEnd(text: string): boolean {
  const normalized = text.trim();
  const match = DATE_RANGE.exec(normalized);
  if (!match) return false;
  const endIndex = match.index + match[0].length;
  return endIndex >= normalized.length - 2;
}

function looksExperienceRoleLine(text: string): boolean {
  const normalized = text.trim();
  if (normalized.length === 0 || normalized.length > 120) return false;
  if (looksLikeExperienceBulletOrProse(normalized)) return false;
  if (experienceDateRangeAtEnd(normalized)) return true;
  if (normalized.length > 80) return false;
  // Compact PDFs sometimes emit role titles as plain lines without heading kind.
  return /^(?:[A-Z0-9][A-Za-z0-9\s.\-/&,]*(?:\b(?:SDE|SRE|VP|Intern|Analyst|Associate|Engineer|Developer|Manager|Architect|Consultant|Lead|Specialist|Designer)\b))/iu.test(
    normalized,
  );
}

function cleanRole(raw: string): { role: string; period: string | null } {
  const match = DATE_RANGE.exec(raw);
  if (!match) return { role: raw.trim(), period: null };
  return {
    role: raw.replace(match[0], "").replace(/\s{2,}/gu, " ").trim() || raw.trim(),
    period: match[0].trim(),
  };
}

function looksLikeOrganizationHeader(text: string, hasPreviousOrganization: boolean): boolean {
  const normalized = text.trim();
  if (normalized.length === 0 || normalized.length > 96) return false;
  if (looksExperienceRoleLine(normalized) || looksLikeExperienceBulletOrProse(normalized)) return false;
  if (resumeSectionKind(normalized)) return false;
  if (/[/:]/u.test(normalized)) return false;

  const hasOrganizationCue =
    /,/u.test(normalized) ||
    /\b(?:inc|llc|ltd|limited|corp|corporation|company|technologies|technology|systems|solutions|labs|studio|group|bank|stanley|harness)\b/iu.test(
      normalized,
    );

  if (hasOrganizationCue) return true;
  if (hasPreviousOrganization) return false;

  const words = normalized.split(/\s+/u);
  return words.length <= 4 && words.every((word) => /^[A-Z0-9][A-Za-z0-9&.'-]*$/u.test(word));
}

function addExperience(
  parse: CanonicalParse,
  section: ResumeMajorSection,
  fields: ExtractedFieldValue[],
  startRowIndex = 0,
): number {
  const entries = splitExperienceEntries(section);
  let lastOrganization = "";
  let rowIndex = startRowIndex;
  let pendingRolelessBlocks: CanonicalBlock[] = [];

  entries.forEach((entry) => {
    const headerTexts = entry.headers.map(blockText).filter(Boolean);
    const roleHeaderIndex = (() => {
      for (let i = headerTexts.length - 1; i >= 0; i -= 1) {
        if (looksExperienceRoleLine(headerTexts[i]!)) return i;
      }
      return -1;
    })();

    if (roleHeaderIndex < 0) {
      pendingRolelessBlocks.push(...entry.headers, ...entry.body);
      return;
    }

    const organizationHeader = roleHeaderIndex > 0 ? headerTexts[0]! : "";
    const explicitOrganization =
      organizationHeader && looksLikeOrganizationHeader(organizationHeader, lastOrganization.length > 0)
        ? organizationHeader
        : "";
    if (explicitOrganization) lastOrganization = explicitOrganization;
    const organization = explicitOrganization || lastOrganization;
    const roleSource = headerTexts[roleHeaderIndex] ?? "";
    const { role, period } = cleanRole(roleSource);
    const ignoredHeaderBlocks = entry.headers.filter((_, headerIndex) => {
      if (headerIndex === roleHeaderIndex) return false;
      if (explicitOrganization && headerIndex === 0) return false;
      return true;
    });
    const descriptionBlocks = pendingRolelessBlocks.concat(ignoredHeaderBlocks).concat(entry.body);
    pendingRolelessBlocks = [];
    const description = descriptionBlocks
      .map((block) => blockText(block).replace(/^[-*•]\s*/u, ""))
      .filter(Boolean)
      .join("\n");
    const headerBlocks = [entry.headers[roleHeaderIndex]!].filter(Boolean);

    addArrayRow(parse, fields, "experience", rowIndex, {
      organization: {
        label: "Organization",
        type: "string",
        value: organization,
        blocks: explicitOrganization ? entry.headers.slice(0, 1) : headerBlocks,
      },
      role: { label: "Role", type: "string", value: role, blocks: headerBlocks },
      period: { label: "Period", type: "string", value: period ?? "", blocks: headerBlocks },
      description: {
        label: "Description",
        type: "text",
        value: description,
        blocks: descriptionBlocks.length > 0 ? descriptionBlocks : headerBlocks,
      },
    });
    rowIndex += 1;
  });

  if (pendingRolelessBlocks.length > 0) {
    const description = pendingRolelessBlocks
      .map((block) => blockText(block).replace(/^[-*•]\s*/u, ""))
      .filter(Boolean)
      .join("\n");
    if (rowIndex > 0) {
      const descPath = `experience[${rowIndex - 1}].description`;
      const descField = fields.find((field) => field.path === descPath);
      if (descField) {
        descField.value = [descField.value, description].filter(Boolean).join("\n");
        descField.sources = [blockSpan(parse, pendingRolelessBlocks)];
      }
    } else if (description) {
      addArrayRow(parse, fields, "experience", rowIndex, {
        organization: { label: "Organization", type: "string", value: "", blocks: [section.heading] },
        role: { label: "Role", type: "string", value: "", blocks: [section.heading] },
        period: { label: "Period", type: "string", value: "", blocks: [section.heading] },
        description: {
          label: "Description",
          type: "text",
          value: description,
          blocks: pendingRolelessBlocks,
        },
      });
      rowIndex += 1;
    }
  }
  return rowIndex;
}

function splitSectionChunks(section: ResumeMajorSection): Array<{ heading: CanonicalBlock | null; body: CanonicalBlock[] }> {
  const chunks: Array<{ heading: CanonicalBlock | null; body: CanonicalBlock[] }> = [];
  let current: { heading: CanonicalBlock | null; body: CanonicalBlock[] } | null = null;

  const push = () => {
    if (current && (current.heading || current.body.length > 0)) chunks.push(current);
    current = null;
  };

  for (const block of section.blocks) {
    if (block.kind === "heading") {
      push();
      current = { heading: block, body: [] };
      continue;
    }
    if (["paragraph", "line", "list-item", "kv"].includes(block.kind)) {
      if (!current) current = { heading: null, body: [] };
      current.body.push(block);
    }
  }
  push();
  return chunks;
}

function stripDateRange(raw: string): { text: string; period: string | null } {
  const match = DATE_RANGE.exec(raw);
  if (!match) return { text: raw.trim(), period: null };
  return {
    text: raw.replace(match[0], "").replace(/\s{2,}/gu, " ").trim(),
    period: match[0].trim(),
  };
}

function addEducation(
  parse: CanonicalParse,
  section: ResumeMajorSection,
  fields: ExtractedFieldValue[],
  startRowIndex = 0,
): number {
  const chunks: Array<{ heading: CanonicalBlock | null; body: CanonicalBlock[] }> = [];
  for (const chunk of splitSectionChunks(section)) {
    const previous = chunks[chunks.length - 1];
    if (previous && chunk.heading && chunk.body.length === 0 && !DATE_RANGE.test(chunk.heading.text)) {
      previous.body.push(chunk.heading);
      continue;
    }
    chunks.push(chunk);
  }

  let rowIndex = startRowIndex;
  for (const chunk of chunks) {
    const rowBlocks = [...(chunk.heading ? [chunk.heading] : []), ...chunk.body];
    const rowLines = rowBlocks.map(blockText).filter(Boolean);
    const combined = rowLines.join("\n");
    if (!combined.trim()) continue;

    const { text: institution, period: institutionPeriod } = stripDateRange(chunk.heading?.text ?? rowLines[0] ?? "");
    const bodyLines = chunk.heading ? chunk.body.map(blockText).filter(Boolean) : rowLines.slice(1);
    const { text: credential, period: credentialPeriod } = stripDateRange(bodyLines.join("\n"));
    const period = credentialPeriod ?? institutionPeriod ?? stripDateRange(combined).period;
    const credentialBlocks = chunk.heading ? chunk.body : rowBlocks.slice(1);

    addArrayRow(parse, fields, "education", rowIndex, {
      institution: {
        label: "Institution",
        type: "string",
        value: institution,
        blocks: chunk.heading ? [chunk.heading] : credentialBlocks.slice(0, 1),
      },
      credential: {
        label: "Credential",
        type: "text",
        value: credential,
        blocks: credentialBlocks.length > 0 ? credentialBlocks : [section.heading],
      },
      period: {
        label: "Period",
        type: "string",
        value: period ?? "",
        blocks: rowBlocks.length > 0 ? rowBlocks : [section.heading],
      },
    });
    rowIndex += 1;
  }
  return rowIndex;
}

function addProjects(
  parse: CanonicalParse,
  section: ResumeMajorSection,
  fields: ExtractedFieldValue[],
  startRowIndex = 0,
): number {
  const chunks = splitSectionChunks(section);
  let rowIndex = startRowIndex;
  for (const chunk of chunks) {
    const description = chunk.body
      .map((block) => blockText(block).replace(/^[-*•]\s*/u, ""))
      .filter(Boolean)
      .join("\n");
    const name = chunk.heading?.text ?? "";
    if (!name.trim() && !description.trim()) continue;

    addArrayRow(parse, fields, "projects", rowIndex, {
      name: {
        label: "Name",
        type: "string",
        value: name,
        blocks: chunk.heading ? [chunk.heading] : chunk.body.slice(0, 1),
      },
      description: {
        label: "Description",
        type: "text",
        value: description || name,
        blocks: chunk.body.length > 0 ? chunk.body : chunk.heading ? [chunk.heading] : [section.heading],
      },
    });
    rowIndex += 1;
  }
  return rowIndex;
}

const ACHIEVEMENT_KEYWORD =
  /\b(award|recognition|certificate|certification|scholarship|honou?r|prize|fellowship|showcase|hackathon)\b/iu;

function isAchievementBulletBlock(block: CanonicalBlock): boolean {
  const text = blockText(block);
  return block.kind === "list-item" || /^[-*•]\s/u.test(text);
}

function looksLikeAchievementLead(text: string): boolean {
  const normalized = text.replace(/^[-*•]\s*/u, "").trim();
  if (normalized.length === 0) return false;
  if (/^[-*•]\s/u.test(text.trim())) return true;
  if (/^(?:recipient|won|received|achieved|secured|completed|recognized)\b/iu.test(normalized)) return true;
  return ACHIEVEMENT_KEYWORD.test(normalized) && normalized.length >= 20;
}

function looksLikeAchievementContinuation(text: string, combinedSoFar: string): boolean {
  const normalized = text.replace(/^[-*•]\s*/u, "").trim();
  const combined = combinedSoFar.trim();
  if (normalized.length === 0 || combined.length === 0) return false;
  if (/^[-*•]\s/u.test(text.trim())) return false;
  if (looksLikeAchievementLead(normalized) && !/[.!?]\s*$/u.test(combined)) {
    return false;
  }
  if (/^[\d(]/u.test(normalized)) return true;
  if (
    /^(?:for|and|across|with|to|in|on|from|by|at|via|within|including|reducing|improving|solving|designing|building)\b/iu.test(
      normalized,
    )
  ) {
    return true;
  }
  if (/^[a-z]/u.test(normalized)) return true;
  if (normalized.length < 72 && !ACHIEVEMENT_KEYWORD.test(normalized)) return true;
  if (!/[.!?]\s*$/u.test(combined) && normalized.length < 100 && !looksLikeAchievementLead(normalized)) return true;
  return false;
}

function isAchievementContentBlock(block: CanonicalBlock): boolean {
  if (["list-item", "paragraph", "line", "kv"].includes(block.kind)) return true;
  // The line analyzer can treat short award titles as headings; keep them in this section.
  return block.kind === "heading" && resumeSectionKind(block.text) === null;
}

function groupAchievementBlocks(blocks: CanonicalBlock[]): CanonicalBlock[][] {
  const groups: CanonicalBlock[][] = [];
  let current: CanonicalBlock[] = [];

  const flush = () => {
    if (current.length > 0) groups.push(current);
    current = [];
  };

  for (const block of blocks) {
    if (!isAchievementContentBlock(block)) continue;
    const text = blockText(block);
    if (!text) continue;

    const combined = current.map(blockText).join(" ");
    if (current.length === 0) {
      current.push(block);
      continue;
    }

    if (isAchievementBulletBlock(block)) {
      flush();
      current.push(block);
      continue;
    }

    if (looksLikeAchievementContinuation(text, combined)) {
      current.push(block);
      continue;
    }

    flush();
    current.push(block);
  }
  flush();
  return groups;
}

function joinAchievementText(blocks: CanonicalBlock[]): string {
  return blocks
    .map((block) => blockText(block).replace(/^[-*•]\s*/u, "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s{2,}/gu, " ")
    .trim();
}

function addAchievements(
  parse: CanonicalParse,
  section: ResumeMajorSection,
  fields: ExtractedFieldValue[],
  startRowIndex = 0,
): number {
  const groups = groupAchievementBlocks(section.blocks);
  let rowIndex = startRowIndex;
  for (const group of groups) {
    const value = joinAchievementText(group);
    if (!value) continue;
    addArrayRow(parse, fields, "achievements", rowIndex, {
      text: { label: "Text", type: "text", value, blocks: group },
    });
    rowIndex += 1;
  }
  return rowIndex;
}

function addSkills(
  parse: CanonicalParse,
  section: ResumeMajorSection,
  fields: ExtractedFieldValue[],
  startRowIndex = 0,
): number {
  const sectionStart = section.heading.offsetStart;
  const sectionEnd = section.blocks.length > 0 ? section.blocks[section.blocks.length - 1]!.offsetEnd : section.heading.offsetEnd;
  const kvs = parse.keyValues.filter((kv) => kv.valueOffsetStart >= sectionStart && kv.valueOffsetEnd <= sectionEnd);
  let row = startRowIndex;
  for (const kv of kvs) {
    const keyStart = Math.max(sectionStart, parse.text.lastIndexOf(kv.key, kv.valueOffsetStart));
    const keyBlock: CanonicalBlock = {
      kind: "line",
      text: kv.key,
      offsetStart: keyStart,
      offsetEnd: keyStart + kv.key.length,
      level: null,
      page: kv.page,
    };
    const valueBlock: CanonicalBlock = {
      kind: "line",
      text: kv.value,
      offsetStart: kv.valueOffsetStart,
      offsetEnd: kv.valueOffsetEnd,
      level: null,
      page: kv.page,
    };
    addArrayRow(parse, fields, "skills", row, {
      category: { label: "Category", type: "string", value: humanizeLabel(kv.key), blocks: [keyBlock] },
      text: { label: "Skills", type: "text", value: kv.value, blocks: [valueBlock] },
    });
    row += 1;
  }

  if (row === startRowIndex) {
    const text = sectionPlainText(section.blocks);
    if (text) {
      addArrayRow(parse, fields, "skills", row, {
        category: { label: "Category", type: "string", value: "Skills", blocks: [section.heading] },
        text: { label: "Skills", type: "text", value: text, blocks: section.blocks },
      });
      row += 1;
    }
  }
  return row;
}

function assertUniqueFieldPaths(fields: ExtractedFieldValue[]): void {
  const seen = new Set<string>();
  for (const field of fields) {
    if (seen.has(field.path)) {
      throw new Error(`Duplicate extraction field path: ${field.path}`);
    }
    seen.add(field.path);
  }
}

/** Canonical resume/CV field tree (shared with the built-in published schema). */
export function buildResumeSchemaFields(): SchemaFieldDef[] {
  return [
    scalarDef("candidateName", "Candidate name", "string", "profile", {
      material: true,
      semanticKey: "person",
      isSummary: true,
    }),
    scalarDef("email", "Email", "string", "contact", { semanticKey: "email", isSummary: true }),
    scalarDef("phone", "Phone", "string", "contact"),
    scalarDef("linkedin", "LinkedIn", "string", "contact"),
    scalarDef("github", "GitHub", "string", "contact"),
    scalarDef("summary", "Summary", "text", "profile"),
    arrayDef("skills", "Skills", [
      { key: "category", label: "Category", type: "string" },
      { key: "text", label: "Skills", type: "text" },
    ]),
    arrayDef("experience", "Experience", [
      { key: "organization", label: "Organization", type: "string" },
      { key: "role", label: "Role", type: "string" },
      { key: "period", label: "Period", type: "string" },
      { key: "description", label: "Description", type: "text" },
    ]),
    arrayDef("education", "Education", [
      { key: "institution", label: "Institution", type: "string" },
      { key: "credential", label: "Credential", type: "text" },
      { key: "period", label: "Period", type: "string" },
    ]),
    arrayDef("projects", "Projects", [
      { key: "name", label: "Name", type: "string" },
      { key: "description", label: "Description", type: "text" },
    ]),
    arrayDef("achievements", "Achievements", [{ key: "text", label: "Text", type: "text" }]),
  ];
}

/**
 * Stable schema extraction for resumes/CVs. This intentionally avoids using
 * arbitrary PDF headings (company names, job titles, date ranges) as schema
 * keys; those become row values inside generalized arrays instead.
 */
export function extractResumeFields(parse: CanonicalParse): {
  schemaFields: SchemaFieldDef[];
  fields: ExtractedFieldValue[];
  presentSections: string[];
} | null {
  const { sections: rawSections, preamble } = splitResumeMajorSections(parse.blocks);
  const sections = coalesceAdjacentSections(rawSections);
  if (!isResumeLike(parse, sections)) return null;

  const schemaFields = buildResumeSchemaFields();

  const fields: ExtractedFieldValue[] = [];
  const candidate = findCandidateNameBlock(preamble);
  if (candidate) {
    fields.push(makeField(parse, "candidateName", "Candidate name", "string", "profile", candidate.text, [candidate], {
      confidenceScore: 0.86,
      confidenceState: "high",
      material: true,
    }));
  }

  for (const [key, label, regex] of [
    ["email", "Email", EMAIL],
    ["phone", "Phone", PHONE],
    ["linkedin", "LinkedIn", LINKEDIN],
    ["github", "GitHub", GITHUB],
  ] as const) {
    const match = regex.exec(parse.text);
    if (match?.[0] && match.index >= 0) fields.push(makeRegexField(parse, key, label, match[0], match.index));
  }

  let experienceRow = 0;
  let educationRow = 0;
  let skillsRow = 0;
  let projectsRow = 0;
  let achievementsRow = 0;
  for (const section of sections) {
    switch (section.kind) {
      case "summary": {
        const text = sectionPlainText(section.blocks);
        if (text) fields.push(makeField(parse, "summary", "Summary", "text", "profile", text, section.blocks));
        break;
      }
      case "skills":
        skillsRow = addSkills(parse, section, fields, skillsRow);
        break;
      case "experience":
        experienceRow = addExperience(parse, section, fields, experienceRow);
        break;
      case "education":
        educationRow = addEducation(parse, section, fields, educationRow);
        break;
      case "projects":
        projectsRow = addProjects(parse, section, fields, projectsRow);
        break;
      case "achievements":
        achievementsRow = addAchievements(parse, section, fields, achievementsRow);
        break;
    }
  }

  assertUniqueFieldPaths(fields);

  const presentSections = ["Profile", "Contact"].concat(
    [...new Set(sections.map((section) => humanizeLabel(section.kind)))],
  );
  return { schemaFields, fields, presentSections };
}

/** Split reading-ordered blocks into heading-scoped narrative regions (prose and lists). */
export function splitNarrativeSections(blocks: CanonicalBlock[]): NarrativeSection[] {
  const sections: NarrativeSection[] = [];
  let current: NarrativeSection | null = null;

  const pushCurrent = () => {
    if (current && current.blocks.length > 0) sections.push(current);
    current = null;
  };

  for (const block of blocks) {
    if (block.kind === "heading") {
      pushCurrent();
      current = { title: block.text, heading: block, blocks: [] };
      continue;
    }
    if (!NARRATIVE_KINDS.has(block.kind)) continue;
    if (!current) current = { title: null, heading: null, blocks: [] };
    current.blocks.push(block);
  }
  pushCurrent();
  return sections;
}

function confidenceStateFor(score: number): "high" | "medium" | "low" {
  if (score >= 0.85) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}

function sectionGroupKey(section: NarrativeSection): string {
  if (section.title) return slugKey(section.title);
  return "details";
}

function sectionLabel(section: NarrativeSection): string {
  if (section.title) return humanizeLabel(section.title);
  return "Details";
}

/** When false, rely on key/value, tables, or the degraded content fallback. */
export function shouldExtractNarrative(parse: CanonicalParse): boolean {
  if (parse.blocks.some((b) => b.kind === "heading" || b.kind === "list-item")) return true;
  if (parse.keyValues.length >= 4) return false;
  return parse.blocks.some((b) => b.kind === "paragraph");
}

/**
 * Extract prose and bullet lists grouped under headings. Complements key/value and
 * table detection for resumes, briefs, press releases, and other text-heavy docs.
 */
export function extractNarrativeFields(
  parse: CanonicalParse,
  uniqueKey: (base: string) => string,
): { schemaFields: SchemaFieldDef[]; fields: ExtractedFieldValue[] } {
  const schemaFields: SchemaFieldDef[] = [];
  const fields: ExtractedFieldValue[] = [];
  const sections = splitNarrativeSections(parse.blocks);

  for (const section of sections) {
    const group = sectionGroupKey(section);
    const groupLabel = sectionLabel(section);
    const listItems = section.blocks.filter((b) => b.kind === "list-item");
    const proseBlocks = section.blocks.filter((b) => b.kind === "paragraph" || b.kind === "line");

    if (proseBlocks.length > 0) {
      const merged = proseBlocks.map((b) => b.text.trim()).filter((t) => t.length > 0).join("\n\n");
      if (merged.length > 0) {
        const base = section.title ? slugKey(section.title) : "content";
        const key = uniqueKey(base);
        const start = proseBlocks[0]!.offsetStart;
        const end = proseBlocks[proseBlocks.length - 1]!.offsetEnd;
        const score = 0.78;
        const fieldType: FieldType =
          merged.length > 120 || merged.includes("\n") ? "text" : inferType(merged);
        schemaFields.push({
          key,
          label: groupLabel,
          type: fieldType,
          nodeKind: "scalar",
          group,
          required: false,
          material: false,
          isSummary: schemaFields.length < 4,
        });
        fields.push({
          schemaFieldKey: key,
          path: key,
          label: groupLabel,
          group,
          type: fieldType,
          nodeKind: "scalar",
          required: false,
          material: false,
          presenceState: "present",
          valueOrigin: "extracted",
          value: merged,
          confidenceScore: score,
          confidenceState: confidenceStateFor(score),
          confidenceReason: "Narrative text under a document section heading.",
          parseConfidence: parse.sourceKind === "pdf" ? 0.88 : 1,
          sources: [spanFromOffsets(parse, start, end)],
        });
      }
    }

    if (listItems.length > 0) {
      const base = section.title ? slugKey(section.title) : "items";
      const arrayKey = uniqueKey(listItems.length === 1 && !section.title ? "items" : `${base}Entries`);
      const arrayLabel = section.title ? humanizeLabel(section.title) : "Items";
      const colKey = "text";
      schemaFields.push({
        key: arrayKey,
        label: arrayLabel,
        type: "array",
        nodeKind: "array",
        group: arrayKey,
        required: false,
        material: false,
        item: {
          key: `${arrayKey}Item`,
          label: `${arrayLabel} item`,
          type: "object",
          nodeKind: "object",
          group: arrayKey,
          required: false,
          material: false,
          children: [
            {
              key: colKey,
              label: "Text",
              type: "text",
              nodeKind: "scalar",
              group: arrayKey,
              required: false,
              material: false,
            },
          ],
        },
      });

      listItems.forEach((item, rowIndex) => {
        const cell = item.text.trim();
        const score = 0.82;
        fields.push({
          schemaFieldKey: `${arrayKey}[].${colKey}`,
          path: `${arrayKey}[${rowIndex}].${colKey}`,
          label: "Text",
          group: arrayKey,
          type: "text",
          nodeKind: "scalar",
          required: false,
          material: false,
          presenceState: cell.length > 0 ? "present" : "empty",
          valueOrigin: "extracted",
          value: cell.length > 0 ? cell : null,
          confidenceScore: score,
          confidenceState: confidenceStateFor(score),
          confidenceReason: "List item under a document section heading.",
          parseConfidence: parse.sourceKind === "pdf" ? 0.88 : 1,
          sources: [spanFromOffsets(parse, item.offsetStart, item.offsetEnd)],
        });
      });
    }
  }

  return { schemaFields, fields };
}
