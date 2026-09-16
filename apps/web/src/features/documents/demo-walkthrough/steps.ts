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
    search: "orbital-cloud-project-brief",
    title: "Project brief (Markdown)",
    lesson: "A non-invoice document infers a draft schema from headings, labeled facts, and a milestone table.",
  },
  {
    kind: "document",
    search: "q3-support-tickets",
    title: "Support tickets (CSV)",
    lesson: "CSV tables become repeated records that can be reviewed and explored without invoice columns.",
  },
  {
    kind: "document",
    search: "blue-harbor-service-summary",
    title: "Service summary (HTML)",
    lesson: "HTML is treated as untrusted input and shown only as canonical text with grounded fields.",
  },
  {
    kind: "document",
    search: "sample-resume",
    title: "Resume (TXT)",
    lesson: "Built-in Resume schema — experience, education, and skills in reviewable fields.",
  },
  {
    kind: "link",
    href: "/explore?q=Orbital+Cloud+Migration",
    title: "Explore document intelligence",
    lesson: "Natural language becomes editable filters; open a result to inspect Data, JSON, and History.",
  },
];
