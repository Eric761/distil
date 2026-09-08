import type { FieldSpec, FixtureDefinition, InvoiceLayout } from "./types.js";
import { decimal, field, lineItem, money } from "./helpers.js";

const PHASES = ["Reading document", "Detecting fields", "Extracting line items", "Finalizing"];

function identityAmountFields(args: {
  currency: string;
  subtotal: number;
  tax: number;
  total: number;
  taxLabel?: string;
}): FieldSpec[] {
  return [
    field({
      path: "subtotal",
      label: "Subtotal",
      group: "amounts",
      type: "decimal",
      material: true,
      extractedValue: decimal(args.subtotal),
      sourcePath: "subtotal",
    }),
    field({
      path: "tax",
      label: args.taxLabel ?? "Tax",
      group: "amounts",
      type: "decimal",
      material: true,
      extractedValue: decimal(args.tax),
      sourcePath: "tax",
    }),
    field({
      path: "total",
      label: "Total",
      group: "amounts",
      type: "decimal",
      required: true,
      material: true,
      extractedValue: decimal(args.total),
      sourcePath: "total",
    }),
  ];
}

/* ------------------------------------------------------------------ */
/* 1. Acme Office Supply — clean, high confidence                      */
/* ------------------------------------------------------------------ */
function acme(): FixtureDefinition {
  const currency = "USD";
  const items = [
    { description: "Printer paper A4 (case)", qty: 10, unitPrice: 42.0, lineTotal: 420.0 },
    { description: "Ballpoint pens (box of 50)", qty: 6, unitPrice: 12.5, lineTotal: 75.0 },
    { description: "Heavy-duty stapler", qty: 4, unitPrice: 18.75, lineTotal: 75.0 },
    { description: "Sticky notes pack", qty: 20, unitPrice: 6.25, lineTotal: 125.0 },
    { description: "Desk organizer", qty: 5, unitPrice: 21.0, lineTotal: 105.0 },
  ];
  const built = items.map((it, i) => lineItem({ index: i, currency, ...it }));
  const subtotal = 800.0;
  const tax = 68.0;
  const total = 868.0;

  const layout: InvoiceLayout = {
    documentTitle: "INVOICE",
    vendorName: { text: "Acme Office Supply Co.", sourcePath: "vendorName" },
    vendorAddress: ["1420 Market Street", "Springfield, IL 62704", "billing@acme-office.example"],
    meta: [
      { label: "Invoice No.", value: { text: "AC-2024-0912", sourcePath: "invoiceNumber" } },
      { label: "Invoice Date", value: { text: "2024-09-12", sourcePath: "invoiceDate" } },
      { label: "Due Date", value: { text: "2024-10-12", sourcePath: "dueDate" } },
      { label: "Currency", value: { text: "USD", sourcePath: "currency" } },
    ],
    billTo: ["Riverside Media Group", "88 Commerce Ave", "Chicago, IL 60601"],
    lineItemHeaders: { description: "Description", qty: "Qty", unitPrice: "Unit", lineTotal: "Amount" },
    lineItems: built.map((b) => b.layoutRow),
    amounts: [
      { label: "Subtotal", value: { text: money(subtotal, currency), sourcePath: "subtotal" } },
      { label: "Tax (8.5%)", value: { text: money(tax, currency), sourcePath: "tax" } },
      { label: "Total", value: { text: money(total, currency), sourcePath: "total" }, emphasize: true },
    ],
    notes: ["Payment due within 30 days. Thank you for your business."],
  };

  return {
    fixtureId: "acme-clean",
    filename: "acme-office-supply-invoice.pdf",
    descriptor: {
      title: "Acme Office Supply",
      vendorName: "Acme Office Supply Co.",
      scenario: "Clean, high-confidence invoice",
      demonstrates: "Fast review and batch acceptance when everything reconciles.",
    },
    processing: { phases: PHASES, attempts: [{ outcome: "succeeded" }] },
    layout,
    buildFields: () => [
      field({ path: "vendorName", label: "Vendor", group: "identity", type: "string", required: true, extractedValue: "Acme Office Supply Co.", sourcePath: "vendorName" }),
      field({ path: "invoiceNumber", label: "Invoice number", group: "identity", type: "string", required: true, extractedValue: "AC-2024-0912", sourcePath: "invoiceNumber" }),
      field({ path: "invoiceDate", label: "Invoice date", group: "dates", type: "date", required: true, extractedValue: "2024-09-12", sourcePath: "invoiceDate" }),
      field({ path: "dueDate", label: "Due date", group: "dates", type: "date", extractedValue: "2024-10-12", sourcePath: "dueDate" }),
      field({ path: "currency", label: "Currency", group: "identity", type: "currency", required: true, extractedValue: currency, sourcePath: "currency" }),
      ...identityAmountFields({ currency, subtotal, tax, total, taxLabel: "Tax (8.5%)" }),
      ...built.flatMap((b) => b.fields),
    ],
    expectedRecord: {
      vendorName: "Acme Office Supply Co.",
      invoiceNumber: "AC-2024-0912",
      invoiceDate: "2024-09-12",
      dueDate: "2024-10-12",
      currency,
      subtotal: decimal(subtotal),
      tax: decimal(tax),
      total: decimal(total),
    },
  };
}

/* ------------------------------------------------------------------ */
/* 2. Northstar Logistics — terminology variation, medium confidence   */
/* ------------------------------------------------------------------ */
function northstar(): FixtureDefinition {
  const currency = "USD";
  const items = [
    { description: "LTL freight — Zone 3", qty: 1, unitPrice: 1240.0, lineTotal: 1240.0 },
    { description: "Fuel surcharge", qty: 1, unitPrice: 186.0, lineTotal: 186.0 },
    { description: "Liftgate service", qty: 2, unitPrice: 45.0, lineTotal: 90.0 },
  ];
  const built = items.map((it, i) => lineItem({ index: i, currency, ...it }));
  const subtotal = 1516.0;
  const tax = 121.28;
  const total = 1637.28;

  const layout: InvoiceLayout = {
    documentTitle: "BILL",
    vendorName: { text: "Northstar Logistics LLC", sourcePath: "vendorName" },
    vendorAddress: ["77 Harbor Road", "Newark, NJ 07102", "ar@northstar-logistics.example"],
    meta: [
      { label: "Bill No.", value: { text: "NL-88213", sourcePath: "invoiceNumber" } },
      { label: "Issued", value: { text: "03 Aug 2024", sourcePath: "invoiceDate" } },
      { label: "Pay by", value: { text: "02 Sep 2024", sourcePath: "dueDate" } },
    ],
    billTo: ["Cobalt Manufacturing", "210 Industrial Pkwy", "Trenton, NJ 08611"],
    lineItemHeaders: { description: "Service", qty: "Units", unitPrice: "Rate", lineTotal: "Charge" },
    lineItems: built.map((b) => b.layoutRow),
    amounts: [
      { label: "Net charges", value: { text: money(subtotal, currency), sourcePath: "subtotal" } },
      { label: "Tax (8%)", value: { text: money(tax, currency), sourcePath: "tax" } },
      { label: "Amount due", value: { text: money(total, currency), sourcePath: "total" }, emphasize: true },
    ],
    notes: ["Remit to Northstar Logistics LLC. Terms: Net 30 from issue date."],
  };

  return {
    fixtureId: "northstar-terminology",
    filename: "northstar-logistics-bill.pdf",
    descriptor: {
      title: "Northstar Logistics",
      vendorName: "Northstar Logistics LLC",
      scenario: "Different terminology for the same fields",
      demonstrates: "Mapping 'Bill No.', 'Issued', 'Pay by', 'Net charges' with source proof.",
    },
    processing: { phases: PHASES, attempts: [{ outcome: "succeeded" }] },
    layout,
    buildFields: () => [
      field({ path: "vendorName", label: "Vendor", group: "identity", type: "string", required: true, extractedValue: "Northstar Logistics LLC", sourcePath: "vendorName" }),
      field({ path: "invoiceNumber", label: "Invoice number", group: "identity", type: "string", required: true, extractedValue: "NL-88213", confidenceState: "medium", confidenceReason: "Labeled 'Bill No.' — mapped to invoice number.", sourcePath: "invoiceNumber" }),
      field({ path: "invoiceDate", label: "Invoice date", group: "dates", type: "date", required: true, extractedValue: "2024-08-03", confidenceState: "medium", confidenceReason: "Labeled 'Issued' and reformatted from '03 Aug 2024'.", sourcePath: "invoiceDate" }),
      field({ path: "dueDate", label: "Due date", group: "dates", type: "date", extractedValue: "2024-09-02", confidenceState: "medium", confidenceReason: "Labeled 'Pay by' and reformatted from '02 Sep 2024'.", sourcePath: "dueDate" }),
      field({ path: "currency", label: "Currency", group: "identity", type: "currency", required: true, extractedValue: currency, confidenceState: "inferred", confidenceReason: "No explicit code; inferred from '$' amounts.", sourcePath: "total" }),
      ...identityAmountFields({ currency, subtotal, tax, total, taxLabel: "Tax (8%)" }).map((f) =>
        f.path === "subtotal"
          ? { ...f, label: "Net charges", confidenceState: "medium" as const, confidenceReason: "Labeled 'Net charges'." }
          : f,
      ),
      ...built.flatMap((b) => b.fields),
    ],
    expectedRecord: {
      vendorName: "Northstar Logistics LLC",
      invoiceNumber: "NL-88213",
      invoiceDate: "2024-08-03",
      dueDate: "2024-09-02",
      currency,
      subtotal: decimal(subtotal),
      tax: decimal(tax),
      total: decimal(total),
    },
  };
}

/* ------------------------------------------------------------------ */
/* 3. Greenline Maintenance — ambiguous invoice number                 */
/* ------------------------------------------------------------------ */
function greenline(): FixtureDefinition {
  const currency = "USD";
  const items = [
    { description: "Monthly HVAC service", qty: 1, unitPrice: 320.0, lineTotal: 320.0 },
    { description: "Filter replacement", qty: 4, unitPrice: 22.5, lineTotal: 90.0 },
  ];
  const built = items.map((it, i) => lineItem({ index: i, currency, ...it }));
  const subtotal = 410.0;
  const tax = 34.85;
  const total = 444.85;

  const layout: InvoiceLayout = {
    documentTitle: "INVOICE",
    vendorName: { text: "Greenline Maintenance Services", sourcePath: "vendorName" },
    vendorAddress: ["9 Oakfield Lane", "Columbus, OH 43004", "accounts@greenline-maint.example"],
    meta: [
      { label: "PO Number", value: { text: "PO-5567", sourcePath: "poNumber" } },
      { label: "Invoice Date", value: { text: "2024-07-19", sourcePath: "invoiceDate" } },
      { label: "Due Date", value: { text: "2024-08-18", sourcePath: "dueDate" } },
      { label: "Currency", value: { text: "USD", sourcePath: "currency" } },
    ],
    billTo: ["Harborview Offices", "500 Bay St", "Columbus, OH 43215"],
    lineItemHeaders: { description: "Description", qty: "Qty", unitPrice: "Unit", lineTotal: "Amount" },
    lineItems: built.map((b) => b.layoutRow),
    amounts: [
      { label: "Subtotal", value: { text: money(subtotal, currency), sourcePath: "subtotal" } },
      { label: "Tax (8.5%)", value: { text: money(tax, currency), sourcePath: "tax" } },
      { label: "Total", value: { text: money(total, currency), sourcePath: "total" }, emphasize: true },
    ],
    notes: ["Reference PO-5567 on payment. Invoice number to follow under separate cover."],
  };

  return {
    fixtureId: "greenline-missing",
    filename: "greenline-maintenance-invoice.pdf",
    descriptor: {
      title: "Greenline Maintenance",
      vendorName: "Greenline Maintenance Services",
      scenario: "Ambiguous identifier",
      demonstrates: "A PO number is present where an invoice number is expected, so the analyst must verify it.",
    },
    processing: { phases: PHASES, attempts: [{ outcome: "succeeded" }] },
    layout,
    buildFields: () => [
      field({ path: "vendorName", label: "Vendor", group: "identity", type: "string", required: true, extractedValue: "Greenline Maintenance Services", sourcePath: "vendorName" }),
      field({ path: "invoiceNumber", label: "Invoice number", group: "identity", type: "string", required: true, extractedValue: "PO-5567", confidenceState: "low", confidenceReason: "Only a PO number is present; verify whether it should be used as the invoice number.", sourcePath: "poNumber" }),
      field({ path: "poNumber", label: "PO number", group: "metadata", type: "string", extractedValue: "PO-5567", sourcePath: "poNumber" }),
      field({ path: "invoiceDate", label: "Invoice date", group: "dates", type: "date", required: true, extractedValue: "2024-07-19", sourcePath: "invoiceDate" }),
      field({ path: "dueDate", label: "Due date", group: "dates", type: "date", extractedValue: "2024-08-18", sourcePath: "dueDate" }),
      field({ path: "currency", label: "Currency", group: "identity", type: "currency", required: true, extractedValue: currency, sourcePath: "currency" }),
      ...identityAmountFields({ currency, subtotal, tax, total, taxLabel: "Tax (8.5%)" }),
      ...built.flatMap((b) => b.fields),
    ],
    expectedRecord: {
      vendorName: "Greenline Maintenance Services",
      invoiceNumber: "PO-5567",
      invoiceDate: "2024-07-19",
      dueDate: "2024-08-18",
      currency,
      subtotal: decimal(subtotal),
      tax: decimal(tax),
      total: decimal(total),
    },
  };
}

/* ------------------------------------------------------------------ */
/* 4. Atlas Industrial — conflicting totals                            */
/* ------------------------------------------------------------------ */
function atlas(): FixtureDefinition {
  const currency = "USD";
  const items = [
    { description: "Steel brackets", qty: 200, unitPrice: 12.0, lineTotal: 2400.0 },
    { description: "Industrial bolts (case)", qty: 40, unitPrice: 45.0, lineTotal: 1800.0 },
    { description: "Welding consumables", qty: 10, unitPrice: 80.0, lineTotal: 800.0 },
  ];
  const built = items.map((it, i) => lineItem({ index: i, currency, ...it }));
  const subtotal = 5000.0;
  const tax = 400.0;
  const invoiceTotal = 5400.0;
  const deposit = 3000.0;
  const balanceDue = 2400.0;

  const layout: InvoiceLayout = {
    documentTitle: "INVOICE",
    vendorName: { text: "Atlas Industrial Supply", sourcePath: "vendorName" },
    vendorAddress: ["3300 Foundry Blvd", "Pittsburgh, PA 15201", "billing@atlas-industrial.example"],
    meta: [
      { label: "Invoice No.", value: { text: "ATL-33915", sourcePath: "invoiceNumber" } },
      { label: "Invoice Date", value: { text: "2024-06-10", sourcePath: "invoiceDate" } },
      { label: "Due Date", value: { text: "2024-07-10", sourcePath: "dueDate" } },
      { label: "Currency", value: { text: "USD", sourcePath: "currency" } },
    ],
    billTo: ["Keystone Fabrication", "12 Mill St", "Pittsburgh, PA 15222"],
    lineItemHeaders: { description: "Description", qty: "Qty", unitPrice: "Unit", lineTotal: "Amount" },
    lineItems: built.map((b) => b.layoutRow),
    amounts: [
      { label: "Subtotal", value: { text: money(subtotal, currency), sourcePath: "subtotal" } },
      { label: "Tax (8%)", value: { text: money(tax, currency), sourcePath: "tax" } },
      { label: "Invoice total", value: { text: money(invoiceTotal, currency), sourcePath: "total.invoiceTotal" }, emphasize: true },
      { label: "Deposit received", value: { text: money(deposit, currency), sourcePath: "total.deposit" } },
      { label: "Balance due", value: { text: money(balanceDue, currency), sourcePath: "total.balanceDue" }, emphasize: true },
    ],
    notes: ["A 60% deposit was applied. Remit remaining balance by the due date."],
  };

  return {
    fixtureId: "atlas-conflict",
    filename: "atlas-industrial-invoice.pdf",
    descriptor: {
      title: "Atlas Industrial",
      vendorName: "Atlas Industrial Supply",
      scenario: "Conflicting values",
      demonstrates: "Two competing 'total' candidates the user must resolve.",
    },
    processing: { phases: PHASES, attempts: [{ outcome: "succeeded" }] },
    layout,
    buildFields: () => [
      field({ path: "vendorName", label: "Vendor", group: "identity", type: "string", required: true, extractedValue: "Atlas Industrial Supply", sourcePath: "vendorName" }),
      field({ path: "invoiceNumber", label: "Invoice number", group: "identity", type: "string", required: true, extractedValue: "ATL-33915", sourcePath: "invoiceNumber" }),
      field({ path: "invoiceDate", label: "Invoice date", group: "dates", type: "date", required: true, extractedValue: "2024-06-10", sourcePath: "invoiceDate" }),
      field({ path: "dueDate", label: "Due date", group: "dates", type: "date", extractedValue: "2024-07-10", sourcePath: "dueDate" }),
      field({ path: "currency", label: "Currency", group: "identity", type: "currency", required: true, extractedValue: currency, sourcePath: "currency" }),
      field({ path: "subtotal", label: "Subtotal", group: "amounts", type: "decimal", material: true, extractedValue: decimal(subtotal), sourcePath: "subtotal" }),
      field({ path: "tax", label: "Tax (8%)", group: "amounts", type: "decimal", material: true, extractedValue: decimal(tax), sourcePath: "tax" }),
      field({
        path: "total",
        label: "Total",
        group: "amounts",
        type: "decimal",
        required: true,
        material: true,
        extractedValue: decimal(invoiceTotal),
        confidenceState: "conflicting",
        confidenceReason: "Three total-like amounts found: invoice total, deposit, and balance due.",
        sourcePath: "total.invoiceTotal",
        conflictCandidates: [
          { id: "invoiceTotal", label: "Invoice total", value: decimal(invoiceTotal), sourcePath: "total.invoiceTotal" },
          { id: "balanceDue", label: "Balance due", value: decimal(balanceDue), sourcePath: "total.balanceDue" },
        ],
      }),
      ...built.flatMap((b) => b.fields),
    ],
    expectedRecord: {
      vendorName: "Atlas Industrial Supply",
      invoiceNumber: "ATL-33915",
      invoiceDate: "2024-06-10",
      dueDate: "2024-07-10",
      currency,
      subtotal: decimal(subtotal),
      tax: decimal(tax),
      total: decimal(invoiceTotal),
    },
  };
}

/* ------------------------------------------------------------------ */
/* 5. Meridian Components — nested line items (EUR), one cell mismatch  */
/* ------------------------------------------------------------------ */
function meridian(): FixtureDefinition {
  const currency = "EUR";
  const rawItems = [
    { description: "Resistor pack 100R", qty: 50, unitPrice: 2.4, lineTotal: 120.0 },
    { description: "Capacitor 10uF", qty: 30, unitPrice: 3.1, lineTotal: 93.0 },
    { description: "Microcontroller board", qty: 10, unitPrice: 18.5, lineTotal: 185.0 },
    { description: "LED assortment", qty: 25, unitPrice: 4.2, lineTotal: 105.0 },
    { description: "Jumper wires (set)", qty: 40, unitPrice: 1.75, lineTotal: 70.0 },
    { description: "Breadboard", qty: 15, unitPrice: 6.8, lineTotal: 102.0 },
    { description: "Voltage regulator", qty: 12, unitPrice: 5.0, lineTotal: 72.0, mismatch: true },
    { description: "Heat sink", qty: 20, unitPrice: 2.25, lineTotal: 45.0 },
    { description: "Soldering flux", qty: 8, unitPrice: 9.5, lineTotal: 76.0 },
    { description: "Header pins (strip)", qty: 60, unitPrice: 0.9, lineTotal: 54.0 },
    { description: "USB connector", qty: 35, unitPrice: 1.4, lineTotal: 49.0 },
    { description: "Enclosure box", qty: 10, unitPrice: 7.6, lineTotal: 76.0 },
  ];
  const built = rawItems.map((it, i) =>
    lineItem({
      index: i,
      currency,
      description: it.description,
      qty: it.qty,
      unitPrice: it.unitPrice,
      lineTotal: it.lineTotal,
      lineTotalConfidence: it.mismatch ? "low" : "high",
      lineTotalReason: it.mismatch
        ? "Printed amount does not equal quantity times unit price."
        : null,
    }),
  );
  const discount = 47.0;
  const subtotal = 1000.0;
  const tax = 190.0;
  const total = 1190.0;

  const amountRows: InvoiceLayout["amounts"] = [
    { label: "Subtotal", value: { text: money(subtotal, currency), sourcePath: "subtotal" } },
    { label: "Discount", value: { text: `-${money(discount, currency)}`, sourcePath: "discount" } },
    { label: "VAT (19%)", value: { text: money(tax, currency), sourcePath: "tax" } },
    { label: "Total", value: { text: money(total, currency), sourcePath: "total" }, emphasize: true },
  ];

  const layout: InvoiceLayout = {
    documentTitle: "INVOICE",
    vendorName: { text: "Meridian Components GmbH", sourcePath: "vendorName" },
    vendorAddress: ["Industriestrasse 12", "80331 Munchen", "Germany"],
    meta: [
      { label: "Invoice No.", value: { text: "MC-2024-4471", sourcePath: "invoiceNumber" } },
      { label: "Invoice Date", value: { text: "2024-05-22", sourcePath: "invoiceDate" } },
      { label: "Due Date", value: { text: "2024-06-21", sourcePath: "dueDate" } },
      { label: "Currency", value: { text: "EUR", sourcePath: "currency" } },
    ],
    lineItemHeaders: { description: "Article", qty: "Qty", unitPrice: "Unit", lineTotal: "Amount" },
    lineItems: built.map((b) => b.layoutRow),
    amounts: amountRows,
    notes: ["VAT ID DE123456789. Payment within 30 days net."],
  };

  return {
    fixtureId: "meridian-lineitems",
    filename: "meridian-components-invoice.pdf",
    descriptor: {
      title: "Meridian Components",
      vendorName: "Meridian Components GmbH",
      scenario: "Nested line items with a mismatch",
      demonstrates: "EUR invoice, 12 line items, and a quantity x unit price mismatch.",
    },
    processing: { phases: PHASES, attempts: [{ outcome: "succeeded" }] },
    layout,
    buildFields: () => [
      field({ path: "vendorName", label: "Vendor", group: "identity", type: "string", required: true, extractedValue: "Meridian Components GmbH", sourcePath: "vendorName" }),
      field({ path: "invoiceNumber", label: "Invoice number", group: "identity", type: "string", required: true, extractedValue: "MC-2024-4471", sourcePath: "invoiceNumber" }),
      field({ path: "invoiceDate", label: "Invoice date", group: "dates", type: "date", required: true, extractedValue: "2024-05-22", sourcePath: "invoiceDate" }),
      field({ path: "dueDate", label: "Due date", group: "dates", type: "date", extractedValue: "2024-06-21", sourcePath: "dueDate" }),
      field({ path: "currency", label: "Currency", group: "identity", type: "currency", required: true, extractedValue: currency, confidenceReason: "Detected from euro symbol.", sourcePath: "currency" }),
      field({ path: "subtotal", label: "Subtotal", group: "amounts", type: "decimal", material: true, extractedValue: decimal(subtotal), confidenceState: "medium", confidenceReason: "Line totals do not sum to subtotal; one line looks mispriced.", sourcePath: "subtotal" }),
      field({ path: "discount", label: "Discount", group: "amounts", type: "decimal", extractedValue: decimal(discount), sourcePath: "discount" }),
      field({ path: "tax", label: "VAT (19%)", group: "amounts", type: "decimal", material: true, extractedValue: decimal(tax), sourcePath: "tax" }),
      field({ path: "total", label: "Total", group: "amounts", type: "decimal", required: true, material: true, extractedValue: decimal(total), sourcePath: "total" }),
      ...built.flatMap((b) => b.fields),
    ],
    expectedRecord: {
      vendorName: "Meridian Components GmbH",
      invoiceNumber: "MC-2024-4471",
      invoiceDate: "2024-05-22",
      dueDate: "2024-06-21",
      currency,
      subtotal: decimal(subtotal),
      tax: decimal(tax),
      total: decimal(total),
    },
  };
}

/* ------------------------------------------------------------------ */
/* 6. Redbrick Consulting — recoverable partial extraction             */
/* ------------------------------------------------------------------ */
function redbrick(): FixtureDefinition {
  const currency = "USD";
  const items = [
    { description: "Discovery workshop", qty: 2, unitPrice: 1200.0, lineTotal: 2400.0 },
    { description: "Solution architecture", qty: 1, unitPrice: 3500.0, lineTotal: 3500.0 },
    { description: "Advisory hours", qty: 16, unitPrice: 175.0, lineTotal: 2800.0 },
  ];
  const built = items.map((it, i) => lineItem({ index: i, currency, ...it }));
  const subtotal = 8700.0;
  const tax = 0.0;
  const total = 8700.0;

  const layout: InvoiceLayout = {
    documentTitle: "INVOICE",
    vendorName: { text: "Redbrick Consulting Group", sourcePath: "vendorName" },
    vendorAddress: ["55 Beacon St, Suite 400", "Boston, MA 02108", "billing@redbrick-consult.example"],
    meta: [
      { label: "Invoice No.", value: { text: "RC-7781", sourcePath: "invoiceNumber" } },
      { label: "Invoice Date", value: { text: "2024-04-15", sourcePath: "invoiceDate" } },
      { label: "Payment Terms", value: { text: "Net 30", sourcePath: "paymentTerms" } },
      { label: "Currency", value: { text: "USD", sourcePath: "currency" } },
    ],
    billTo: ["Vantage Retail Co.", "900 Summit Ave", "Boston, MA 02118"],
    lineItemHeaders: { description: "Service", qty: "Qty", unitPrice: "Rate", lineTotal: "Amount" },
    lineItems: built.map((b) => b.layoutRow),
    amounts: [
      { label: "Subtotal", value: { text: money(subtotal, currency), sourcePath: "subtotal" } },
      { label: "Tax", value: { text: money(tax, currency), sourcePath: "tax" } },
      { label: "Total", value: { text: money(total, currency), sourcePath: "total" }, emphasize: true },
    ],
    notes: ["Services rendered under MSA-2023-14. No due date printed; terms are Net 30."],
  };

  return {
    fixtureId: "redbrick-partial",
    filename: "redbrick-consulting-invoice.pdf",
    descriptor: {
      title: "Redbrick Consulting",
      vendorName: "Redbrick Consulting Group",
      scenario: "Recoverable partial extraction",
      demonstrates: "First attempt fails; retry recovers most fields but the dates section is partial.",
    },
    processing: {
      phases: PHASES,
      attempts: [
        { outcome: "failed", code: "EXTRACTOR_TIMEOUT", message: "The extractor timed out reading the document. This is safe to retry.", retryable: true },
        { outcome: "partial", missingSections: ["dates"], note: "Dates section could not be fully recovered on retry." },
      ],
    },
    layout,
    buildFields: () => [
      field({ path: "vendorName", label: "Vendor", group: "identity", type: "string", required: true, extractedValue: "Redbrick Consulting Group", sourcePath: "vendorName" }),
      field({ path: "invoiceNumber", label: "Invoice number", group: "identity", type: "string", required: true, extractedValue: "RC-7781", sourcePath: "invoiceNumber" }),
      field({ path: "invoiceDate", label: "Invoice date", group: "dates", type: "date", required: true, extractedValue: "2024-04-15", confidenceState: "inferred", confidenceReason: "Dates section partially recovered after retry; verify against the document.", sourcePath: "invoiceDate" }),
      field({ path: "dueDate", label: "Due date", group: "dates", type: "date", extractedValue: null, confidenceState: "missing", confidenceReason: "No due date printed; payment terms are 'Net 30'.", sourcePath: null }),
      field({ path: "paymentTerms", label: "Payment terms", group: "metadata", type: "string", extractedValue: "Net 30", sourcePath: "paymentTerms" }),
      field({ path: "currency", label: "Currency", group: "identity", type: "currency", required: true, extractedValue: currency, sourcePath: "currency" }),
      ...identityAmountFields({ currency, subtotal, tax, total }),
      ...built.flatMap((b) => b.fields),
    ],
    expectedRecord: {
      vendorName: "Redbrick Consulting Group",
      invoiceNumber: "RC-7781",
      invoiceDate: "2024-04-15",
      dueDate: null,
      currency,
      subtotal: decimal(subtotal),
      tax: decimal(tax),
      total: decimal(total),
    },
  };
}

type SimpleFixtureOptions = {
  fixtureId: string;
  filename: string;
  title: string;
  vendorName: string;
  vendorAddress: string[];
  scenario: string;
  demonstrates: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  currency: string;
  billTo: string[];
  items: Array<{ description: string; qty: number; unitPrice: number; lineTotal: number }>;
  subtotal: number;
  tax: number;
  total: number;
  taxLabel?: string;
  processing?: FixtureDefinition["processing"];
  notes?: string[];
  customizeFields?: (fields: FieldSpec[]) => FieldSpec[];
};

function simpleInvoice(options: SimpleFixtureOptions): FixtureDefinition {
  const built = options.items.map((it, i) => lineItem({ index: i, currency: options.currency, ...it }));
  const meta: InvoiceLayout["meta"] = [
    { label: "Invoice No.", value: { text: options.invoiceNumber, sourcePath: "invoiceNumber" } },
    { label: "Invoice Date", value: { text: options.invoiceDate, sourcePath: "invoiceDate" } },
    ...(options.dueDate ? [{ label: "Due Date", value: { text: options.dueDate, sourcePath: "dueDate" } }] : []),
    { label: "Currency", value: { text: options.currency, sourcePath: "currency" } },
  ];

  const layout: InvoiceLayout = {
    documentTitle: "INVOICE",
    vendorName: { text: options.vendorName, sourcePath: "vendorName" },
    vendorAddress: options.vendorAddress,
    meta,
    billTo: options.billTo,
    lineItemHeaders: { description: "Description", qty: "Qty", unitPrice: "Unit", lineTotal: "Amount" },
    lineItems: built.map((b) => b.layoutRow),
    amounts: [
      { label: "Subtotal", value: { text: money(options.subtotal, options.currency), sourcePath: "subtotal" } },
      { label: options.taxLabel ?? "Tax", value: { text: money(options.tax, options.currency), sourcePath: "tax" } },
      { label: "Total", value: { text: money(options.total, options.currency), sourcePath: "total" }, emphasize: true },
    ],
    notes: options.notes,
  };

  const buildBaseFields = (): FieldSpec[] => [
    field({ path: "vendorName", label: "Vendor", group: "identity", type: "string", required: true, extractedValue: options.vendorName, sourcePath: "vendorName" }),
    field({ path: "invoiceNumber", label: "Invoice number", group: "identity", type: "string", required: true, extractedValue: options.invoiceNumber, sourcePath: "invoiceNumber" }),
    field({ path: "invoiceDate", label: "Invoice date", group: "dates", type: "date", required: true, extractedValue: options.invoiceDate, sourcePath: "invoiceDate" }),
    field({ path: "dueDate", label: "Due date", group: "dates", type: "date", extractedValue: options.dueDate, sourcePath: options.dueDate ? "dueDate" : null }),
    field({ path: "currency", label: "Currency", group: "identity", type: "currency", required: true, extractedValue: options.currency, sourcePath: "currency" }),
    ...identityAmountFields({
      currency: options.currency,
      subtotal: options.subtotal,
      tax: options.tax,
      total: options.total,
      taxLabel: options.taxLabel,
    }),
    ...built.flatMap((b) => b.fields),
  ];

  return {
    fixtureId: options.fixtureId,
    filename: options.filename,
    descriptor: {
      title: options.title,
      vendorName: options.vendorName,
      scenario: options.scenario,
      demonstrates: options.demonstrates,
    },
    processing: options.processing ?? { phases: PHASES, attempts: [{ outcome: "succeeded" }] },
    layout,
    buildFields: () => options.customizeFields?.(buildBaseFields()) ?? buildBaseFields(),
    expectedRecord: {
      vendorName: options.vendorName,
      invoiceNumber: options.invoiceNumber,
      invoiceDate: options.invoiceDate,
      dueDate: options.dueDate,
      currency: options.currency,
      subtotal: decimal(options.subtotal),
      tax: decimal(options.tax),
      total: decimal(options.total),
    },
  };
}

function solara(): FixtureDefinition {
  return simpleInvoice({
    fixtureId: "solara-ready",
    filename: "solara-healthcare-ready-invoice.pdf",
    title: "Solara Healthcare",
    vendorName: "Solara Healthcare Supplies",
    vendorAddress: ["18 Carewell Drive", "Phoenix, AZ 85004", "billing@solara-health.example"],
    scenario: "Clean medical supplies invoice",
    demonstrates: "A no-issue document that is ready for approval.",
    invoiceNumber: "SHS-24091",
    invoiceDate: "2024-09-05",
    dueDate: "2024-10-05",
    currency: "USD",
    billTo: ["Canyon Family Clinic", "221 Mesa Road", "Phoenix, AZ 85012"],
    items: [
      { description: "Exam gloves - nitrile", qty: 24, unitPrice: 18.5, lineTotal: 444.0 },
      { description: "Disposable masks", qty: 40, unitPrice: 9.25, lineTotal: 370.0 },
      { description: "Alcohol prep pads", qty: 15, unitPrice: 12.0, lineTotal: 180.0 },
    ],
    subtotal: 994.0,
    tax: 84.49,
    total: 1078.49,
    taxLabel: "Tax (8.5%)",
  });
}

function bluePeak(): FixtureDefinition {
  return simpleInvoice({
    fixtureId: "bluepeak-low-total",
    filename: "bluepeak-energy-low-confidence-total.pdf",
    title: "BluePeak Energy",
    vendorName: "BluePeak Energy Services",
    vendorAddress: ["4400 Gridline Ave", "Denver, CO 80202", "receivables@bluepeak-energy.example"],
    scenario: "Low-confidence total",
    demonstrates: "The total was read from a faint stamp and needs analyst verification.",
    invoiceNumber: "BP-78420",
    invoiceDate: "2024-08-28",
    dueDate: "2024-09-27",
    currency: "USD",
    billTo: ["Summit Foods Distribution", "1400 Alpine Way", "Denver, CO 80216"],
    items: [
      { description: "Facility power service", qty: 1, unitPrice: 1840.0, lineTotal: 1840.0 },
      { description: "Demand adjustment", qty: 1, unitPrice: 215.5, lineTotal: 215.5 },
      { description: "Renewable energy credit", qty: 1, unitPrice: 75.0, lineTotal: 75.0 },
    ],
    subtotal: 2130.5,
    tax: 85.22,
    total: 2215.72,
    customizeFields: (fields) =>
      fields.map((f) =>
        f.path === "total"
          ? {
              ...f,
              confidenceState: "low",
              confidenceScore: 0.36,
              confidenceReason: "The total is printed over a faint approval stamp.",
            }
          : f,
      ),
  });
}

function cedarWorks(): FixtureDefinition {
  return simpleInvoice({
    fixtureId: "cedarworks-invalid-date",
    filename: "cedarworks-studio-invalid-date.pdf",
    title: "CedarWorks Studio",
    vendorName: "CedarWorks Design Studio",
    vendorAddress: ["610 Pine Street", "Portland, OR 97205", "finance@cedarworks.example"],
    scenario: "Invalid date format",
    demonstrates: "A non-ISO invoice date creates a validation error in review.",
    invoiceNumber: "CW-INV-1038",
    invoiceDate: "09/17/2024",
    dueDate: "2024-10-17",
    currency: "USD",
    billTo: ["Brightpath Education", "82 Campus Loop", "Portland, OR 97201"],
    items: [
      { description: "Brand system refresh", qty: 1, unitPrice: 3200.0, lineTotal: 3200.0 },
      { description: "Landing page design", qty: 2, unitPrice: 950.0, lineTotal: 1900.0 },
    ],
    subtotal: 5100.0,
    tax: 0.0,
    total: 5100.0,
    customizeFields: (fields) =>
      fields.map((f) =>
        f.path === "invoiceDate"
          ? {
              ...f,
              confidenceState: "medium",
              confidenceScore: 0.68,
              confidenceReason: "Date was extracted as printed and needs normalization.",
            }
          : f,
      ),
  });
}

function lumenFleet(): FixtureDefinition {
  return simpleInvoice({
    fixtureId: "lumenfleet-partial",
    filename: "lumenfleet-transport-partial-extraction.pdf",
    title: "LumenFleet Transport",
    vendorName: "LumenFleet Transport Ltd.",
    vendorAddress: ["22 Dockside Quay", "Liverpool L3 4AD", "billing@lumenfleet.example"],
    scenario: "Partial extraction",
    demonstrates: "Processing completed partially with the dates section missing.",
    invoiceNumber: "LF-55109",
    invoiceDate: "2024-07-30",
    dueDate: null,
    currency: "GBP",
    billTo: ["Orbital Market Group", "9 King Street", "Manchester M2 4LQ"],
    items: [
      { description: "Regional pallet delivery", qty: 8, unitPrice: 145.0, lineTotal: 1160.0 },
      { description: "Weekend handling", qty: 1, unitPrice: 220.0, lineTotal: 220.0 },
    ],
    subtotal: 1380.0,
    tax: 276.0,
    total: 1656.0,
    taxLabel: "VAT (20%)",
    processing: {
      phases: PHASES,
      attempts: [{ outcome: "partial", missingSections: ["dates"], note: "Date fields were obscured during extraction." }],
    },
    customizeFields: (fields) =>
      fields.map((f) =>
        f.path === "dueDate"
          ? {
              ...f,
              confidenceState: "missing",
              confidenceScore: null,
              confidenceReason: "The due-date area is obscured by a scan fold.",
            }
          : f,
      ),
  });
}

function novaFoods(): FixtureDefinition {
  return simpleInvoice({
    fixtureId: "novafoods-failed",
    filename: "novafoods-catering-processing-failed.pdf",
    title: "NovaFoods Catering",
    vendorName: "NovaFoods Catering Co.",
    vendorAddress: ["700 Market Hall", "Austin, TX 78701", "ar@novafoods.example"],
    scenario: "Processing failed",
    demonstrates: "A retryable extraction failure appears in the document list.",
    invoiceNumber: "NF-4097",
    invoiceDate: "2024-08-12",
    dueDate: "2024-09-11",
    currency: "USD",
    billTo: ["Juniper Events", "44 Congress Ave", "Austin, TX 78704"],
    items: [
      { description: "Boxed lunch service", qty: 120, unitPrice: 14.5, lineTotal: 1740.0 },
      { description: "Beverage station", qty: 1, unitPrice: 260.0, lineTotal: 260.0 },
    ],
    subtotal: 2000.0,
    tax: 165.0,
    total: 2165.0,
  });
}

function prismWorks(): FixtureDefinition {
  return simpleInvoice({
    fixtureId: "prismworks-uploaded",
    filename: "prismworks-media-uploaded-not-processed.pdf",
    title: "PrismWorks Media",
    vendorName: "PrismWorks Media LLC",
    vendorAddress: ["19 Channel Road", "Los Angeles, CA 90028", "billing@prismworks.example"],
    scenario: "Uploaded, not processed",
    demonstrates: "A document waiting for the user to start extraction.",
    invoiceNumber: "PWM-22014",
    invoiceDate: "2024-09-18",
    dueDate: "2024-10-18",
    currency: "USD",
    billTo: ["North Pier Apparel", "505 Sunset Blvd", "Los Angeles, CA 90026"],
    items: [
      { description: "Product shoot day rate", qty: 2, unitPrice: 1800.0, lineTotal: 3600.0 },
      { description: "Retouching package", qty: 1, unitPrice: 750.0, lineTotal: 750.0 },
    ],
    subtotal: 4350.0,
    tax: 391.5,
    total: 4741.5,
  });
}

function harborStone(): FixtureDefinition {
  return simpleInvoice({
    fixtureId: "harborstone-queued",
    filename: "harborstone-labs-queued-processing.pdf",
    title: "HarborStone Labs",
    vendorName: "HarborStone Labs Inc.",
    vendorAddress: ["301 Research Park", "Raleigh, NC 27606", "ap@harborstone.example"],
    scenario: "Queued for processing",
    demonstrates: "A document queued in the processing pipeline.",
    invoiceNumber: "HSL-9012",
    invoiceDate: "2024-09-20",
    dueDate: "2024-10-20",
    currency: "USD",
    billTo: ["Pine Valley Biotech", "800 Discovery Drive", "Durham, NC 27703"],
    items: [
      { description: "Assay kit batch", qty: 6, unitPrice: 420.0, lineTotal: 2520.0 },
      { description: "Cold-chain handling", qty: 1, unitPrice: 185.0, lineTotal: 185.0 },
    ],
    subtotal: 2705.0,
    tax: 202.88,
    total: 2907.88,
  });
}

function everline(): FixtureDefinition {
  return simpleInvoice({
    fixtureId: "everline-processing",
    filename: "everline-legal-active-processing.pdf",
    title: "Everline Legal",
    vendorName: "Everline Legal Services",
    vendorAddress: ["88 Barrister Lane", "New York, NY 10007", "billing@everline-legal.example"],
    scenario: "Currently processing",
    demonstrates: "A document visibly in progress with a current extraction phase.",
    invoiceNumber: "ELS-7744",
    invoiceDate: "2024-09-22",
    dueDate: "2024-10-22",
    currency: "USD",
    billTo: ["Aster Capital Partners", "7 Liberty Plaza", "New York, NY 10006"],
    items: [
      { description: "Contract review", qty: 12, unitPrice: 310.0, lineTotal: 3720.0 },
      { description: "Filing preparation", qty: 4, unitPrice: 185.0, lineTotal: 740.0 },
    ],
    subtotal: 4460.0,
    tax: 0.0,
    total: 4460.0,
  });
}

/* ------------------------------------------------------------------ */
/* 15–28. Expanded demo library — approved, ready, review, complex    */
/* ------------------------------------------------------------------ */

function vantageRetail(): FixtureDefinition {
  return simpleInvoice({
    fixtureId: "vantage-retail",
    filename: "vantage-retail-clean-invoice.pdf",
    title: "Vantage Retail Co.",
    vendorName: "Vantage Retail Co.",
    vendorAddress: ["900 Summit Ave", "Boston, MA 02118", "ap@vantage-retail.example"],
    scenario: "Clean retail invoice",
    demonstrates: "Approved record available for query and export.",
    invoiceNumber: "VR-2024-1182",
    invoiceDate: "2024-03-14",
    dueDate: "2024-04-13",
    currency: "USD",
    billTo: ["Redbrick Consulting Group", "55 Beacon St", "Boston, MA 02108"],
    items: [
      { description: "Store fixtures shipment", qty: 1, unitPrice: 4820.0, lineTotal: 4820.0 },
      { description: "Installation labor", qty: 16, unitPrice: 95.0, lineTotal: 1520.0 },
    ],
    subtotal: 6340.0,
    tax: 507.2,
    total: 6847.2,
    taxLabel: "Tax (8%)",
  });
}

function summitFoods(): FixtureDefinition {
  return simpleInvoice({
    fixtureId: "summit-foods",
    filename: "summit-foods-distribution-invoice.pdf",
    title: "Summit Foods Distribution",
    vendorName: "Summit Foods Distribution",
    vendorAddress: ["1400 Alpine Way", "Denver, CO 80216", "billing@summit-foods.example"],
    scenario: "Routine vendor payment",
    demonstrates: "Another approved USD invoice in the trusted record set.",
    invoiceNumber: "SFD-88401",
    invoiceDate: "2024-06-22",
    dueDate: "2024-07-22",
    currency: "USD",
    billTo: ["BluePeak Energy Services", "4400 Gridline Ave", "Denver, CO 80202"],
    items: [
      { description: "Cold storage pallet rental", qty: 4, unitPrice: 320.0, lineTotal: 1280.0 },
      { description: "Refrigerated transport", qty: 2, unitPrice: 890.0, lineTotal: 1780.0 },
      { description: "Dock unloading", qty: 3, unitPrice: 145.0, lineTotal: 435.0 },
    ],
    subtotal: 3495.0,
    tax: 279.6,
    total: 3774.6,
    taxLabel: "Tax (8%)",
  });
}

function pineValleyBiotech(): FixtureDefinition {
  return simpleInvoice({
    fixtureId: "pinevalley-biotech",
    filename: "pine-valley-biotech-invoice.pdf",
    title: "Pine Valley Biotech",
    vendorName: "Pine Valley Biotech",
    vendorAddress: ["800 Discovery Drive", "Durham, NC 27703", "finance@pinevalley.example"],
    scenario: "Life-sciences procurement",
    demonstrates: "Approved lab supplies for cross-document query.",
    invoiceNumber: "PVB-2406-77",
    invoiceDate: "2024-06-18",
    dueDate: "2024-07-18",
    currency: "USD",
    billTo: ["HarborStone Labs Inc.", "301 Research Park", "Raleigh, NC 27606"],
    items: [
      { description: "PCR reagent kit", qty: 8, unitPrice: 245.0, lineTotal: 1960.0 },
      { description: "Sterile pipette tips", qty: 12, unitPrice: 68.5, lineTotal: 822.0 },
      { description: "Sample vials (case)", qty: 5, unitPrice: 112.0, lineTotal: 560.0 },
    ],
    subtotal: 3342.0,
    tax: 267.36,
    total: 3609.36,
    taxLabel: "Tax (8%)",
  });
}

function orbitalMarket(): FixtureDefinition {
  return simpleInvoice({
    fixtureId: "orbital-market",
    filename: "orbital-market-group-invoice.pdf",
    title: "Orbital Market Group",
    vendorName: "Orbital Market Group",
    vendorAddress: ["9 King Street", "Manchester M2 4LQ", "billing@orbital-market.example"],
    scenario: "GBP retail services",
    demonstrates: "Approved multi-currency record for query filters.",
    invoiceNumber: "OMG-UK-4410",
    invoiceDate: "2024-05-08",
    dueDate: "2024-06-07",
    currency: "GBP",
    billTo: ["LumenFleet Transport Ltd.", "22 Dockside Quay", "Liverpool L3 4AD"],
    items: [
      { description: "Merchandising audit", qty: 1, unitPrice: 2200.0, lineTotal: 2200.0 },
      { description: "Shelf compliance review", qty: 6, unitPrice: 175.0, lineTotal: 1050.0 },
    ],
    subtotal: 3250.0,
    tax: 650.0,
    total: 3900.0,
    taxLabel: "VAT (20%)",
  });
}

function keystoneFabrication(): FixtureDefinition {
  return simpleInvoice({
    fixtureId: "keystone-fabrication",
    filename: "keystone-fabrication-industrial-invoice.pdf",
    title: "Keystone Fabrication",
    vendorName: "Keystone Fabrication",
    vendorAddress: ["12 Mill St", "Pittsburgh, PA 15222", "ar@keystone-fab.example"],
    scenario: "Industrial materials",
    demonstrates: "High-value approved invoice linked to Atlas vendor chain.",
    invoiceNumber: "KF-99214",
    invoiceDate: "2024-06-12",
    dueDate: "2024-07-12",
    currency: "USD",
    billTo: ["Atlas Industrial Supply", "3300 Foundry Blvd", "Pittsburgh, PA 15201"],
    items: [
      { description: "Custom steel frame batch", qty: 1, unitPrice: 12400.0, lineTotal: 12400.0 },
      { description: "Surface finishing", qty: 1, unitPrice: 1850.0, lineTotal: 1850.0 },
    ],
    subtotal: 14250.0,
    tax: 1140.0,
    total: 15390.0,
    taxLabel: "Tax (8%)",
  });
}

function canyonClinic(): FixtureDefinition {
  return simpleInvoice({
    fixtureId: "canyon-clinic",
    filename: "canyon-family-clinic-invoice.pdf",
    title: "Canyon Family Clinic",
    vendorName: "Canyon Family Clinic",
    vendorAddress: ["221 Mesa Road", "Phoenix, AZ 85012", "admin@canyon-clinic.example"],
    scenario: "Healthcare facility billing",
    demonstrates: "Approved clinic invoice for date-range queries.",
    invoiceNumber: "CFC-2409-03",
    invoiceDate: "2024-09-03",
    dueDate: "2024-10-03",
    currency: "USD",
    billTo: ["Solara Healthcare Supplies", "18 Carewell Drive", "Phoenix, AZ 85004"],
    items: [
      { description: "Annual wellness screening", qty: 48, unitPrice: 65.0, lineTotal: 3120.0 },
      { description: "Vaccine administration", qty: 120, unitPrice: 28.5, lineTotal: 3420.0 },
    ],
    subtotal: 6540.0,
    tax: 0.0,
    total: 6540.0,
    notes: ["Tax-exempt healthcare services. Net 30."],
  });
}

function brightpathEducation(): FixtureDefinition {
  return simpleInvoice({
    fixtureId: "brightpath-education",
    filename: "brightpath-education-ready-invoice.pdf",
    title: "Brightpath Education",
    vendorName: "Brightpath Education",
    vendorAddress: ["82 Campus Loop", "Portland, OR 97201", "finance@brightpath-ed.example"],
    scenario: "Clean education services",
    demonstrates: "Ready for one-click approval with no open issues.",
    invoiceNumber: "BE-INV-2204",
    invoiceDate: "2024-08-01",
    dueDate: "2024-08-31",
    currency: "USD",
    billTo: ["CedarWorks Design Studio", "610 Pine Street", "Portland, OR 97205"],
    items: [
      { description: "Curriculum design workshop", qty: 3, unitPrice: 1400.0, lineTotal: 4200.0 },
      { description: "Faculty training session", qty: 2, unitPrice: 950.0, lineTotal: 1900.0 },
    ],
    subtotal: 6100.0,
    tax: 0.0,
    total: 6100.0,
    notes: ["Educational services — tax exempt."],
  });
}

function juniperEvents(): FixtureDefinition {
  return simpleInvoice({
    fixtureId: "juniper-events",
    filename: "juniper-events-ready-invoice.pdf",
    title: "Juniper Events",
    vendorName: "Juniper Events",
    vendorAddress: ["44 Congress Ave", "Austin, TX 78704", "billing@juniper-events.example"],
    scenario: "Event services invoice",
    demonstrates: "Another clean document awaiting analyst approval.",
    invoiceNumber: "JE-4092",
    invoiceDate: "2024-08-15",
    dueDate: "2024-09-14",
    currency: "USD",
    billTo: ["NovaFoods Catering Co.", "700 Market Hall", "Austin, TX 78701"],
    items: [
      { description: "Venue coordination", qty: 1, unitPrice: 2800.0, lineTotal: 2800.0 },
      { description: "AV equipment rental", qty: 1, unitPrice: 1650.0, lineTotal: 1650.0 },
      { description: "On-site staffing", qty: 8, unitPrice: 125.0, lineTotal: 1000.0 },
    ],
    subtotal: 5450.0,
    tax: 449.63,
    total: 5899.63,
    taxLabel: "Tax (8.25%)",
  });
}

function asterCapital(): FixtureDefinition {
  return simpleInvoice({
    fixtureId: "aster-capital",
    filename: "aster-capital-reopened-invoice.pdf",
    title: "Aster Capital Partners",
    vendorName: "Aster Capital Partners",
    vendorAddress: ["7 Liberty Plaza", "New York, NY 10006", "ap@aster-capital.example"],
    scenario: "Reopened after approval",
    demonstrates: "Previously approved record reopened when totals were questioned.",
    invoiceNumber: "ACP-2409-18",
    invoiceDate: "2024-09-18",
    dueDate: "2024-10-18",
    currency: "USD",
    billTo: ["Everline Legal Services", "88 Barrister Lane", "New York, NY 10007"],
    items: [
      { description: "Due diligence review", qty: 1, unitPrice: 8900.0, lineTotal: 8900.0 },
      { description: "Compliance memo", qty: 1, unitPrice: 3200.0, lineTotal: 3200.0 },
    ],
    subtotal: 12100.0,
    tax: 0.0,
    total: 12100.0,
    notes: ["Professional services — no sales tax."],
  });
}

function cobaltManufacturing(): FixtureDefinition {
  return simpleInvoice({
    fixtureId: "cobalt-manufacturing",
    filename: "cobalt-manufacturing-review-invoice.pdf",
    title: "Cobalt Manufacturing",
    vendorName: "Cobalt Manufacturing",
    vendorAddress: ["210 Industrial Pkwy", "Trenton, NJ 08611", "billing@cobalt-mfg.example"],
    scenario: "Inferred currency and dates",
    demonstrates: "Medium-confidence fields need analyst confirmation before approval.",
    invoiceNumber: "CM-77831",
    invoiceDate: "2024-07-28",
    dueDate: "2024-08-27",
    currency: "USD",
    billTo: ["Northstar Logistics LLC", "77 Harbor Road", "Newark, NJ 07102"],
    items: [
      { description: "Precision machined parts", qty: 250, unitPrice: 18.4, lineTotal: 4600.0 },
      { description: "Quality inspection", qty: 1, unitPrice: 680.0, lineTotal: 680.0 },
    ],
    subtotal: 5280.0,
    tax: 422.4,
    total: 5702.4,
    taxLabel: "Tax (8%)",
    customizeFields: (fields) =>
      fields.map((f) => {
        if (f.path === "currency") {
          return {
            ...f,
            confidenceState: "inferred",
            confidenceScore: 0.52,
            confidenceReason: "Currency inferred from dollar symbols; no explicit code on the PDF.",
          };
        }
        if (f.path === "invoiceDate") {
          return {
            ...f,
            confidenceState: "medium",
            confidenceScore: 0.71,
            confidenceReason: "Date label reads 'Issue date' rather than 'Invoice date'.",
          };
        }
        return f;
      }),
  });
}

function westfieldCatering(): FixtureDefinition {
  return simpleInvoice({
    fixtureId: "westfield-catering",
    filename: "westfield-catering-missing-due-date.pdf",
    title: "Westfield Catering Group",
    vendorName: "Westfield Catering Group",
    vendorAddress: ["155 Festival Row", "Chicago, IL 60605", "ar@westfield-catering.example"],
    scenario: "Missing due date",
    demonstrates: "Required due date absent — approval blocked until resolved.",
    invoiceNumber: "WCG-2407-55",
    invoiceDate: "2024-07-11",
    dueDate: null,
    currency: "USD",
    billTo: ["Riverside Media Group", "88 Commerce Ave", "Chicago, IL 60601"],
    items: [
      { description: "Corporate luncheon service", qty: 1, unitPrice: 3400.0, lineTotal: 3400.0 },
      { description: "Beverage package", qty: 1, unitPrice: 890.0, lineTotal: 890.0 },
    ],
    subtotal: 4290.0,
    tax: 364.65,
    total: 4654.65,
    taxLabel: "Tax (8.5%)",
    notes: ["Payment terms: Net 30 from invoice date. No due date printed."],
    customizeFields: (fields) =>
      fields.map((f) =>
        f.path === "dueDate"
          ? {
              ...f,
              confidenceState: "missing",
              confidenceScore: null,
              confidenceReason: "No due date found; infer from Net 30 terms or enter manually.",
            }
          : f,
      ),
  });
}

function graniteData(): FixtureDefinition {
  const currency = "USD";
  const items = [
    { description: "Cloud infrastructure — annual", qty: 1, unitPrice: 24000.0, lineTotal: 24000.0 },
    { description: "Data pipeline setup", qty: 1, unitPrice: 8500.0, lineTotal: 8500.0 },
    { description: "Onboarding support (hours)", qty: 40, unitPrice: 175.0, lineTotal: 7000.0 },
  ];
  const built = items.map((it, i) => lineItem({ index: i, currency, ...it }));
  const subtotal = 39500.0;
  const tax = 0.0;
  const invoiceTotal = 39500.0;
  const prepaid = 15000.0;
  const amountDue = 24500.0;

  const layout: InvoiceLayout = {
    documentTitle: "INVOICE",
    vendorName: { text: "Granite Data Systems", sourcePath: "vendorName" },
    vendorAddress: ["500 Tech Park Blvd", "San Jose, CA 95110", "billing@granite-data.example"],
    meta: [
      { label: "Invoice No.", value: { text: "GDS-2024-881", sourcePath: "invoiceNumber" } },
      { label: "Invoice Date", value: { text: "2024-04-22", sourcePath: "invoiceDate" } },
      { label: "Due Date", value: { text: "2024-05-22", sourcePath: "dueDate" } },
      { label: "Currency", value: { text: "USD", sourcePath: "currency" } },
    ],
    billTo: ["Meridian Components GmbH", "Industriestrasse 12", "80331 Munchen"],
    lineItemHeaders: { description: "Service", qty: "Qty", unitPrice: "Rate", lineTotal: "Amount" },
    lineItems: built.map((b) => b.layoutRow),
    amounts: [
      { label: "Subtotal", value: { text: money(subtotal, currency), sourcePath: "subtotal" } },
      { label: "Tax", value: { text: money(tax, currency), sourcePath: "tax" } },
      { label: "Contract total", value: { text: money(invoiceTotal, currency), sourcePath: "total.contractTotal" }, emphasize: true },
      { label: "Prepaid amount", value: { text: money(prepaid, currency), sourcePath: "total.prepaid" } },
      { label: "Amount due", value: { text: money(amountDue, currency), sourcePath: "total.amountDue" }, emphasize: true },
    ],
    notes: ["SaaS contract — 38% prepaid at signing. Remaining balance due by due date."],
  };

  return {
    fixtureId: "granite-data",
    filename: "granite-data-systems-conflict-invoice.pdf",
    descriptor: {
      title: "Granite Data Systems",
      vendorName: "Granite Data Systems",
      scenario: "Prepaid vs amount due conflict",
      demonstrates: "Enterprise SaaS invoice with competing total candidates.",
    },
    processing: { phases: PHASES, attempts: [{ outcome: "succeeded" }] },
    layout,
    buildFields: () => [
      field({ path: "vendorName", label: "Vendor", group: "identity", type: "string", required: true, extractedValue: "Granite Data Systems", sourcePath: "vendorName" }),
      field({ path: "invoiceNumber", label: "Invoice number", group: "identity", type: "string", required: true, extractedValue: "GDS-2024-881", sourcePath: "invoiceNumber" }),
      field({ path: "invoiceDate", label: "Invoice date", group: "dates", type: "date", required: true, extractedValue: "2024-04-22", sourcePath: "invoiceDate" }),
      field({ path: "dueDate", label: "Due date", group: "dates", type: "date", extractedValue: "2024-05-22", sourcePath: "dueDate" }),
      field({ path: "currency", label: "Currency", group: "identity", type: "currency", required: true, extractedValue: currency, sourcePath: "currency" }),
      field({ path: "subtotal", label: "Subtotal", group: "amounts", type: "decimal", material: true, extractedValue: decimal(subtotal), sourcePath: "subtotal" }),
      field({ path: "tax", label: "Tax", group: "amounts", type: "decimal", material: true, extractedValue: decimal(tax), sourcePath: "tax" }),
      field({
        path: "total",
        label: "Total",
        group: "amounts",
        type: "decimal",
        required: true,
        material: true,
        extractedValue: decimal(invoiceTotal),
        confidenceState: "conflicting",
        confidenceReason: "Contract total, prepaid amount, and amount due all appear as totals.",
        sourcePath: "total.contractTotal",
        conflictCandidates: [
          { id: "contractTotal", label: "Contract total", value: decimal(invoiceTotal), sourcePath: "total.contractTotal" },
          { id: "amountDue", label: "Amount due", value: decimal(amountDue), sourcePath: "total.amountDue" },
        ],
      }),
      ...built.flatMap((b) => b.fields),
    ],
    expectedRecord: {
      vendorName: "Granite Data Systems",
      invoiceNumber: "GDS-2024-881",
      invoiceDate: "2024-04-22",
      dueDate: "2024-05-22",
      currency,
      subtotal: decimal(subtotal),
      tax: decimal(tax),
      total: decimal(invoiceTotal),
    },
  };
}

function pacificRim(): FixtureDefinition {
  const currency = "USD";
  const rawItems = [
    { description: "Organic jasmine rice (25kg)", qty: 20, unitPrice: 42.0, lineTotal: 840.0 },
    { description: "Sesame oil (case)", qty: 8, unitPrice: 68.5, lineTotal: 548.0 },
    { description: "Soy sauce bulk drum", qty: 4, unitPrice: 125.0, lineTotal: 500.0 },
    { description: "Dried shiitake mushrooms", qty: 15, unitPrice: 28.0, lineTotal: 420.0 },
    { description: "Rice vinegar (case)", qty: 10, unitPrice: 34.5, lineTotal: 345.0 },
    { description: "Nori sheets (pack)", qty: 30, unitPrice: 12.0, lineTotal: 360.0 },
    { description: "Miso paste (tub)", qty: 12, unitPrice: 22.0, lineTotal: 288.0, mismatch: true },
    { description: "Green tea leaves (kg)", qty: 6, unitPrice: 45.0, lineTotal: 270.0 },
    { description: "Wasabi powder (case)", qty: 5, unitPrice: 38.0, lineTotal: 190.0 },
    { description: "Shipping & handling", qty: 1, unitPrice: 285.0, lineTotal: 285.0 },
  ];
  const built = rawItems.map((it, i) =>
    lineItem({
      index: i,
      currency,
      description: it.description,
      qty: it.qty,
      unitPrice: it.unitPrice,
      lineTotal: it.lineTotal,
      lineTotalConfidence: it.mismatch ? "low" : "high",
      lineTotalReason: it.mismatch ? "Printed line total does not match quantity × unit price." : null,
    }),
  );
  const subtotal = 4046.0;
  const tax = 343.91;
  const total = 4389.91;

  const layout: InvoiceLayout = {
    documentTitle: "COMMERCIAL INVOICE",
    vendorName: { text: "Pacific Rim Traders", sourcePath: "vendorName" },
    vendorAddress: ["2200 Harbor Front", "Seattle, WA 98101", "orders@pacific-rim.example"],
    meta: [
      { label: "Invoice No.", value: { text: "PRT-2405-992", sourcePath: "invoiceNumber" } },
      { label: "Invoice Date", value: { text: "2024-05-30", sourcePath: "invoiceDate" } },
      { label: "Due Date", value: { text: "2024-06-29", sourcePath: "dueDate" } },
      { label: "Currency", value: { text: "USD", sourcePath: "currency" } },
    ],
    billTo: ["Summit Foods Distribution", "1400 Alpine Way", "Denver, CO 80216"],
    lineItemHeaders: { description: "Product", qty: "Qty", unitPrice: "Unit", lineTotal: "Amount" },
    lineItems: built.map((b) => b.layoutRow),
    amounts: [
      { label: "Subtotal", value: { text: money(subtotal, currency), sourcePath: "subtotal" } },
      { label: "Tax (8.5%)", value: { text: money(tax, currency), sourcePath: "tax" } },
      { label: "Total", value: { text: money(total, currency), sourcePath: "total" }, emphasize: true },
    ],
    notes: ["FOB Seattle. Payment due within 30 days."],
  };

  return {
    fixtureId: "pacific-rim",
    filename: "pacific-rim-traders-lineitems-invoice.pdf",
    descriptor: {
      title: "Pacific Rim Traders",
      vendorName: "Pacific Rim Traders",
      scenario: "Ten line items with a mismatch",
      demonstrates: "Food-import invoice with nested line-item reconciliation.",
    },
    processing: { phases: PHASES, attempts: [{ outcome: "succeeded" }] },
    layout,
    buildFields: () => [
      field({ path: "vendorName", label: "Vendor", group: "identity", type: "string", required: true, extractedValue: "Pacific Rim Traders", sourcePath: "vendorName" }),
      field({ path: "invoiceNumber", label: "Invoice number", group: "identity", type: "string", required: true, extractedValue: "PRT-2405-992", sourcePath: "invoiceNumber" }),
      field({ path: "invoiceDate", label: "Invoice date", group: "dates", type: "date", required: true, extractedValue: "2024-05-30", sourcePath: "invoiceDate" }),
      field({ path: "dueDate", label: "Due date", group: "dates", type: "date", extractedValue: "2024-06-29", sourcePath: "dueDate" }),
      field({ path: "currency", label: "Currency", group: "identity", type: "currency", required: true, extractedValue: currency, sourcePath: "currency" }),
      field({ path: "subtotal", label: "Subtotal", group: "amounts", type: "decimal", material: true, extractedValue: decimal(subtotal), confidenceState: "medium", confidenceReason: "One line item total does not reconcile with qty × unit price.", sourcePath: "subtotal" }),
      field({ path: "tax", label: "Tax (8.5%)", group: "amounts", type: "decimal", material: true, extractedValue: decimal(tax), sourcePath: "tax" }),
      field({ path: "total", label: "Total", group: "amounts", type: "decimal", required: true, material: true, extractedValue: decimal(total), sourcePath: "total" }),
      ...built.flatMap((b) => b.fields),
    ],
    expectedRecord: {
      vendorName: "Pacific Rim Traders",
      invoiceNumber: "PRT-2405-992",
      invoiceDate: "2024-05-30",
      dueDate: "2024-06-29",
      currency,
      subtotal: decimal(subtotal),
      tax: decimal(tax),
      total: decimal(total),
    },
  };
}

function sterlingAudit(): FixtureDefinition {
  const currency = "USD";
  const items = [
    { description: "Annual financial audit", qty: 1, unitPrice: 18500.0, lineTotal: 18500.0 },
    { description: "Tax compliance review", qty: 1, unitPrice: 4200.0, lineTotal: 4200.0 },
    { description: "Advisory hours", qty: 12, unitPrice: 275.0, lineTotal: 3300.0 },
  ];
  const built = items.map((it, i) => lineItem({ index: i, currency, ...it }));
  const subtotal = 26000.0;
  const tax = 0.0;
  const total = 26000.0;

  const layout: InvoiceLayout = {
    documentTitle: "STATEMENT OF ACCOUNT",
    vendorName: { text: "Sterling Audit Partners LLP", sourcePath: "vendorName" },
    vendorAddress: ["100 Financial District", "Charlotte, NC 28202", "billing@sterling-audit.example"],
    meta: [
      { label: "Reference", value: { text: "SAP-2024-044", sourcePath: "invoiceNumber" } },
      { label: "Statement Date", value: { text: "15 Sep 2024", sourcePath: "invoiceDate" } },
      { label: "Payment Due", value: { text: "15 Oct 2024", sourcePath: "dueDate" } },
    ],
    billTo: ["Aster Capital Partners", "7 Liberty Plaza", "New York, NY 10006"],
    lineItemHeaders: { description: "Engagement", qty: "Hours", unitPrice: "Rate", lineTotal: "Fees" },
    lineItems: built.map((b) => b.layoutRow),
    amounts: [
      { label: "Professional fees", value: { text: money(subtotal, currency), sourcePath: "subtotal" } },
      { label: "Sales tax", value: { text: money(tax, currency), sourcePath: "tax" } },
      { label: "Balance outstanding", value: { text: money(total, currency), sourcePath: "total" }, emphasize: true },
    ],
    notes: ["Professional services — exempt from sales tax. Remit to Sterling Audit Partners LLP."],
  };

  return {
    fixtureId: "sterling-audit",
    filename: "sterling-audit-partners-terminology-invoice.pdf",
    descriptor: {
      title: "Sterling Audit Partners",
      vendorName: "Sterling Audit Partners LLP",
      scenario: "Professional services terminology",
      demonstrates: "'Statement of account' labels mapped to standard invoice fields.",
    },
    processing: { phases: PHASES, attempts: [{ outcome: "succeeded" }] },
    layout,
    buildFields: () => [
      field({ path: "vendorName", label: "Vendor", group: "identity", type: "string", required: true, extractedValue: "Sterling Audit Partners LLP", sourcePath: "vendorName" }),
      field({ path: "invoiceNumber", label: "Invoice number", group: "identity", type: "string", required: true, extractedValue: "SAP-2024-044", confidenceState: "medium", confidenceReason: "Labeled 'Reference' on the statement.", sourcePath: "invoiceNumber" }),
      field({ path: "invoiceDate", label: "Invoice date", group: "dates", type: "date", required: true, extractedValue: "2024-09-15", confidenceState: "medium", confidenceReason: "Reformatted from '15 Sep 2024'.", sourcePath: "invoiceDate" }),
      field({ path: "dueDate", label: "Due date", group: "dates", type: "date", extractedValue: "2024-10-15", confidenceState: "medium", confidenceReason: "Labeled 'Payment Due'.", sourcePath: "dueDate" }),
      field({ path: "currency", label: "Currency", group: "identity", type: "currency", required: true, extractedValue: currency, confidenceState: "inferred", confidenceReason: "Inferred from dollar amounts.", sourcePath: "total" }),
      field({ path: "subtotal", label: "Professional fees", group: "amounts", type: "decimal", material: true, extractedValue: decimal(subtotal), confidenceState: "medium", confidenceReason: "Labeled 'Professional fees'.", sourcePath: "subtotal" }),
      field({ path: "tax", label: "Sales tax", group: "amounts", type: "decimal", material: true, extractedValue: decimal(tax), sourcePath: "tax" }),
      field({ path: "total", label: "Total", group: "amounts", type: "decimal", required: true, material: true, extractedValue: decimal(total), confidenceState: "medium", confidenceReason: "Labeled 'Balance outstanding'.", sourcePath: "total" }),
      ...built.flatMap((b) => b.fields),
    ],
    expectedRecord: {
      vendorName: "Sterling Audit Partners LLP",
      invoiceNumber: "SAP-2024-044",
      invoiceDate: "2024-09-15",
      dueDate: "2024-10-15",
      currency,
      subtotal: decimal(subtotal),
      tax: decimal(tax),
      total: decimal(total),
    },
  };
}

function trailheadOutdoor(): FixtureDefinition {
  return simpleInvoice({
    fixtureId: "trailhead-outdoor",
    filename: "trailhead-outdoor-failed-scan.pdf",
    title: "Trailhead Outdoor Supply",
    vendorName: "Trailhead Outdoor Supply",
    vendorAddress: ["88 Mountain View Rd", "Boulder, CO 80302", "orders@trailhead-outdoor.example"],
    scenario: "Unreadable scan",
    demonstrates: "Second failed extraction for retry demos in the document list.",
    invoiceNumber: "TOS-3318",
    invoiceDate: "2024-09-10",
    dueDate: "2024-10-10",
    currency: "USD",
    billTo: ["Summit Foods Distribution", "1400 Alpine Way", "Denver, CO 80216"],
    items: [
      { description: "Camping equipment bundle", qty: 1, unitPrice: 2200.0, lineTotal: 2200.0 },
      { description: "Bulk tent stakes", qty: 50, unitPrice: 4.5, lineTotal: 225.0 },
    ],
    subtotal: 2425.0,
    tax: 194.0,
    total: 2619.0,
    taxLabel: "Tax (8%)",
  });
}

export function fixtureDefinitions(): FixtureDefinition[] {
  return [
    acme(),
    northstar(),
    greenline(),
    atlas(),
    meridian(),
    redbrick(),
    solara(),
    bluePeak(),
    cedarWorks(),
    lumenFleet(),
    novaFoods(),
    prismWorks(),
    harborStone(),
    everline(),
    vantageRetail(),
    summitFoods(),
    pineValleyBiotech(),
    orbitalMarket(),
    keystoneFabrication(),
    canyonClinic(),
    brightpathEducation(),
    juniperEvents(),
    asterCapital(),
    cobaltManufacturing(),
    westfieldCatering(),
    graniteData(),
    pacificRim(),
    sterlingAudit(),
    trailheadOutdoor(),
  ];
}
