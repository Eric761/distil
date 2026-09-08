import {
  type AmountFilter,
  type InterpretedChip,
  type QueryFilters,
  type QueryInterpretation,
} from "@invoice/contracts";
import { normalizeDecimal } from "../lib/money.js";

const AMOUNT = "\\$?\\u20ac?([0-9][0-9,]*(?:\\.[0-9]+)?)";

function parseAmount(raw: string): string {
  return normalizeDecimal(raw.replace(/,/gu, ""));
}

function matchAmount(text: string): AmountFilter | null {
  const between = new RegExp(`between\\s+${AMOUNT}\\s+and\\s+${AMOUNT}`, "iu").exec(text);
  if (between) {
    return { comparator: "between", value: parseAmount(between[1]!), valueTo: parseAmount(between[2]!) };
  }
  const gte = new RegExp(`(?:at least|>=)\\s+${AMOUNT}`, "iu").exec(text);
  if (gte) return { comparator: "gte", value: parseAmount(gte[1]!) };
  const lte = new RegExp(`(?:at most|<=|no more than)\\s+${AMOUNT}`, "iu").exec(text);
  if (lte) return { comparator: "lte", value: parseAmount(lte[1]!) };
  const gt = new RegExp(`(?:above|over|greater than|more than|>)\\s+${AMOUNT}`, "iu").exec(text);
  if (gt) return { comparator: "gt", value: parseAmount(gt[1]!) };
  const lt = new RegExp(`(?:below|under|less than|<)\\s+${AMOUNT}`, "iu").exec(text);
  if (lt) return { comparator: "lt", value: parseAmount(lt[1]!) };
  return null;
}

function matchCurrency(text: string): string | null {
  if (/\beur\b|\u20ac/iu.test(text)) return "EUR";
  if (/\busd\b|\bdollars?\b|\$/iu.test(text)) return "USD";
  if (/\bgbp\b|\u00a3/iu.test(text)) return "GBP";
  return null;
}

function matchReviewStatus(text: string): QueryFilters["reviewStatus"] | null {
  if (/\bapproved\b/iu.test(text)) return ["approved"];
  if (/\b(needs review|pending|unapproved|draft|to review)\b/iu.test(text)) {
    return ["needs_review", "ready", "reopened"];
  }
  return null;
}

function matchDate(text: string): { field: "invoiceDate"; filter: { from?: string; to?: string } } | null {
  const year = /\bin\s+(20\d{2})\b/iu.exec(text);
  if (year) {
    return { field: "invoiceDate", filter: { from: `${year[1]}-01-01`, to: `${year[1]}-12-31` } };
  }
  const after = /\bafter\s+(\d{4}-\d{2}-\d{2})\b/iu.exec(text);
  const before = /\bbefore\s+(\d{4}-\d{2}-\d{2})\b/iu.exec(text);
  if (after || before) {
    const filter: { from?: string; to?: string } = {};
    if (after) filter.from = after[1]!;
    if (before) filter.to = before[1]!;
    return { field: "invoiceDate", filter };
  }
  return null;
}

const STOPWORDS = new Set([
  "show", "me", "all", "find", "list", "invoices", "invoice", "with", "the", "and", "from",
  "vendor", "amount", "amounts", "total", "than", "in", "of", "a", "an", "that", "are", "is",
  "above", "over", "below", "under", "greater", "less", "more", "between", "at", "least", "most",
  "approved", "pending", "needs", "review", "unapproved", "draft", "after", "before", "no",
]);

/** Deterministically interpret natural language into allowlisted filters. */
export function interpretQuery(text: string | undefined, knownVendors: string[]): QueryInterpretation {
  const original = text?.trim() || null;
  const filters: QueryFilters = {};
  const warnings: string[] = [];

  if (!original) {
    return { originalText: null, filters, chips: [], unparsedTerms: [], warnings, needsClarification: false };
  }

  const lower = original.toLowerCase();
  const consumed = new Set<string>();

  // Vendor: match the longest known vendor whose words appear in the query.
  let matchedVendor: string | null = null;
  for (const vendor of knownVendors) {
    const words = vendor.toLowerCase().split(/\s+/u).filter((w) => w.length > 2);
    if (words.length > 0 && words.every((w) => lower.includes(w))) {
      if (!matchedVendor || vendor.length > matchedVendor.length) matchedVendor = vendor;
    }
  }
  if (matchedVendor) {
    filters.vendor = matchedVendor;
    for (const w of matchedVendor.toLowerCase().split(/\s+/u)) consumed.add(w);
  }

  const amount = matchAmount(original);
  if (amount) {
    filters.amount = amount;
    consumed.add(amount.value);
    if (amount.valueTo) consumed.add(amount.valueTo);
  }

  const currency = matchCurrency(original);
  if (currency) {
    filters.currency = currency;
    // Mark the currency tokens as consumed so they are not reported as ignored.
    for (const w of ["usd", "eur", "gbp", "dollar", "dollars", "euro", "euros", "pound", "pounds"]) {
      consumed.add(w);
    }
  }

  const review = matchReviewStatus(original);
  if (review) filters.reviewStatus = review;

  const date = matchDate(original);
  if (date) filters.invoiceDate = date.filter;

  if (filters.amount && !filters.currency) {
    warnings.push("Amounts are compared without converting currencies. Add a currency to be precise.");
  }

  // Unparsed terms: tokens not consumed and not stopwords/numbers/symbols.
  const tokens = lower.split(/[^a-z0-9]+/u).filter(Boolean);
  const unparsedTerms = tokens.filter(
    (t) => !STOPWORDS.has(t) && !consumed.has(t) && !/^\d/u.test(t) && !(matchedVendor?.toLowerCase().includes(t) ?? false),
  );
  if (unparsedTerms.length > 0) {
    warnings.push(`Ignored: ${unparsedTerms.join(", ")}. Only recognized filters are applied.`);
  }

  const hasFilter = Object.keys(filters).length > 0;
  return {
    originalText: original,
    filters,
    chips: buildChips(filters),
    unparsedTerms,
    warnings,
    needsClarification: !hasFilter,
  };
}

function amountDisplay(a: AmountFilter): string {
  switch (a.comparator) {
    case "gt": return `> ${a.value}`;
    case "gte": return `>= ${a.value}`;
    case "lt": return `< ${a.value}`;
    case "lte": return `<= ${a.value}`;
    case "between": return `${a.value} - ${a.valueTo ?? ""}`;
  }
}

/** Build human-facing chips from canonical filters (kept in sync with execution). */
export function buildChips(filters: QueryFilters): InterpretedChip[] {
  const chips: InterpretedChip[] = [];
  if (filters.vendor) chips.push({ key: "vendor", label: "Vendor", display: filters.vendor });
  if (filters.amount) chips.push({ key: "amount", label: "Total", display: amountDisplay(filters.amount) });
  if (filters.currency) chips.push({ key: "currency", label: "Currency", display: filters.currency });
  if (filters.invoiceDate) {
    const { from, to } = filters.invoiceDate;
    chips.push({ key: "invoiceDate", label: "Invoice date", display: `${from ?? "…"} to ${to ?? "…"}` });
  }
  if (filters.dueDate) {
    const { from, to } = filters.dueDate;
    chips.push({ key: "dueDate", label: "Due date", display: `${from ?? "…"} to ${to ?? "…"}` });
  }
  if (filters.reviewStatus && filters.reviewStatus.length > 0) {
    chips.push({ key: "reviewStatus", label: "Status", display: filters.reviewStatus.join(", ") });
  }
  if (filters.documentType) chips.push({ key: "documentType", label: "Type", display: filters.documentType });
  return chips;
}
