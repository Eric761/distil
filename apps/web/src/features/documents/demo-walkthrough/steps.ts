export type DemoStep =
  | {
      kind: "document";
      search: string;
      title: string;
      lesson: string;
    }
  | {
      kind: "link";
      href: string;
      title: string;
      lesson: string;
    };

export const DEMO_WALKTHROUGH_STEPS: DemoStep[] = [
  {
    kind: "document",
    search: "Greenline",
    title: "Greenline Maintenance",
    lesson: "Ambiguous invoice number — approval stays blocked until you verify it.",
  },
  {
    kind: "document",
    search: "Atlas",
    title: "Atlas Industrial",
    lesson: "Conflicting totals — choose the trusted candidate with source proof.",
  },
  {
    kind: "document",
    search: "Redbrick",
    title: "Redbrick Consulting",
    lesson: "Retry after a failed extraction — partial recovery on the second attempt.",
  },
  {
    kind: "document",
    search: "Acme",
    title: "Acme Office Supply",
    lesson: "Clean invoice — confirm fields and approve into the trusted record set.",
  },
  {
    kind: "link",
    href: "/query?q=invoices+from+Acme+above+500+in+USD",
    title: "Query approved records",
    lesson: "Natural language becomes editable filters; click a result to trace back to the PDF.",
  },
];
