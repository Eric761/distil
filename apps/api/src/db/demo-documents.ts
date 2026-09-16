/**
 * Non-invoice demo documents seeded so evaluators can see the generic
 * parse → classify → infer-schema → extract → review flow without needing to
 * upload their own files or configure OpenAI. Each is a real text-format file
 * whose bytes flow through the same pipeline as user uploads; the deterministic
 * StructuralExtractor infers an ad-hoc schema from labeled key/values, tables,
 * and headings — no provider cost required.
 */
export interface DemoDocument {
  id: string;
  title: string;
  scenario: string;
  demonstrates: string;
  filename: string;
  mimeType: string;
  content: string;
  /** Optional seeded lifecycle state applied after the generic extractor runs. */
  seedState?: "approved" | "reopened" | "failed" | "uploaded" | "queued" | "processing";
  /** Approve after processing so it appears as a trusted row in Explore. */
  approve?: boolean;
}

const PROJECT_BRIEF = `# Project Brief: Orbital Cloud Migration

Project name: Orbital Cloud Migration
Owner: Dana Whitfield
Status: In progress
Start date: 2026-02-01
Target date: 2026-06-30
Budget: 250000
Currency: USD

## Summary

Migrate the legacy billing platform to a managed cloud environment with zero
planned downtime and full audit logging.

## Milestones

Milestone          Owner            Due date        Status
Discovery          Dana Whitfield   2026-02-28      Done
Pilot migration    Raj Patel        2026-04-15      In progress
Full cutover       Dana Whitfield   2026-06-30      Not started
`;

const RELEASE_PLAN = `# Release Plan: Atlas Search

Release owner: Morgan Chen
Target release: 2026-04-18
Environment: Production
Risk level: Medium
Rollback owner: Elena Park

## Scope

Ship faceted search, saved filters, and exportable result sets to the customer
success workspace.

## Gates

Gate                Owner          Due date        Status
Security review     Priya Shah     2026-04-05      Complete
Load test           Omar Diaz      2026-04-09      In progress
Go/no-go            Morgan Chen    2026-04-17      Not started
`;

const COMPLIANCE_CHECKLIST = `# Compliance Checklist: Vendor Onboarding

Program: Vendor onboarding
Control owner: Nisha Rao
Review period: Q2 2026
Status: Ready for audit

## Controls

Control ID    Requirement                         Evidence owner    Status
SOC2-12       Signed DPA on file                  Legal             Complete
SEC-08        Annual security questionnaire       Security          Complete
FIN-03        Bank account verification           Finance           Needs review
OPS-05        Continuity contact confirmed        Operations        Complete
`;

const INCIDENT_RETROSPECTIVE = `# Incident Retrospective: Checkout Latency

Incident ID: INC-2026-0412
Severity: SEV-2
Commander: Ravi Menon
Started at: 2026-04-12 09:15 UTC
Resolved at: 2026-04-12 10:42 UTC
Customer impact: Elevated checkout latency for EU customers

## Timeline

Time       Event                                      Owner
09:15      Alert fired for p95 latency                SRE
09:31      Cache shard saturation identified          Platform
10:10      Traffic shifted to warm standby            SRE
10:42      Latency returned to baseline               Platform

## Follow-ups

- Add shard saturation alerting before failover threshold
- Run quarterly checkout failover drill
- Document cache warm-up checklist
`;

const SUPPORT_TICKETS = `Ticket,Priority,Customer,Status,Hours
SUP-1042,High,Northwind Traders,Resolved,4.5
SUP-1043,Medium,Contoso Ltd,Open,2.0
SUP-1044,Low,Fabrikam Inc,Resolved,1.5
SUP-1045,High,Tailspin Toys,Open,6.0
`;

const SUBSCRIPTION_RENEWALS = `Account,Plan,RenewalDate,ARR,Risk
Blue Harbor Analytics,Enterprise,2026-11-30,57600,Low
Northwind Traders,Team,2026-10-15,14400,Medium
Fabrikam Labs,Enterprise,2026-12-01,91200,High
Tailspin Toys,Starter,2026-09-20,4800,Low
`;

const PRESS_RELEASE = `FOR IMMEDIATE RELEASE

Company: Seedling Robotics
Contact: Maria Alvarez
Email: press@seedlingrobotics.com
Phone: +1 415 555 0142
Date: 2026-03-12
Location: Portland, Oregon

Seedling Robotics Unveils Autonomous Greenhouse Platform

Seedling Robotics today announced the launch of Verdant, an autonomous
greenhouse platform that automates irrigation, lighting, and nutrient dosing.
The system reduces water usage by up to forty percent while improving yield
consistency across growing cycles.

About Seedling Robotics

Founded in 2021, Seedling Robotics builds automation for controlled-environment
agriculture and serves growers across North America.
`;

const SERVICE_SUMMARY = `<!doctype html>
<html>
  <head><title>Service Summary</title></head>
  <body>
    <h1>Managed Support Service Summary</h1>
    <p>Client: Blue Harbor Analytics</p>
    <p>Plan: Enterprise</p>
    <p>Renewal date: 2026-11-30</p>
    <p>Monthly fee: 4800</p>
    <p>Account manager: Priya Nair</p>
    <h2>Included services</h2>
    <table>
      <tr><th>Service</th><th>Tier</th><th>Response time</th></tr>
      <tr><td>Incident response</td><td>Priority</td><td>1 hour</td></tr>
      <tr><td>Quarterly review</td><td>Standard</td><td>5 days</td></tr>
      <tr><td>Security monitoring</td><td>Priority</td><td>Continuous</td></tr>
    </table>
  </body>
</html>
`;

const ONBOARDING_PLAN = `<!doctype html>
<html>
  <head><title>Customer Onboarding Plan</title></head>
  <body>
    <h1>Customer Onboarding Plan</h1>
    <p>Customer: Northwind Traders</p>
    <p>Implementation lead: Sofia Kim</p>
    <p>Kickoff date: 2026-05-04</p>
    <p>Target go-live: 2026-06-18</p>
    <p>Status: At risk</p>
    <h2>Workstreams</h2>
    <table>
      <tr><th>Workstream</th><th>Owner</th><th>Status</th></tr>
      <tr><td>Data import</td><td>Rohan Mehta</td><td>In progress</td></tr>
      <tr><td>SSO setup</td><td>Sofia Kim</td><td>Blocked</td></tr>
      <tr><td>Admin training</td><td>Grace Lee</td><td>Not started</td></tr>
    </table>
  </body>
</html>
`;

const PRODUCT_CATALOG = `<!doctype html>
<html>
  <head><title>Product Catalog Update</title></head>
  <body>
    <h1>Product Catalog Update</h1>
    <p>Catalog: Spring field kit</p>
    <p>Owner: Mateo Alvarez</p>
    <p>Effective date: 2026-03-01</p>
    <p>Currency: USD</p>
    <h2>Items</h2>
    <table>
      <tr><th>SKU</th><th>Name</th><th>Price</th><th>Status</th></tr>
      <tr><td>FK-100</td><td>Soil sensor kit</td><td>149.00</td><td>Active</td></tr>
      <tr><td>FK-205</td><td>Irrigation valve pack</td><td>89.00</td><td>Active</td></tr>
      <tr><td>FK-330</td><td>Greenhouse relay hub</td><td>219.00</td><td>Review</td></tr>
    </table>
  </body>
</html>
`;

const LOW_STRUCTURE_NOTE = `A few unstructured notes from a phone call.

The candidate mentioned analytics, dashboards, and onboarding. There was no
formal template, table, or stable set of labeled fields. This sample is useful
for testing the degraded extraction path where Distil captures source text for
review instead of pretending it found a high-quality schema.
`;

const MEETING_NOTES = `Customer Success Handoff

Account: Fabrikam Labs
CSM: Leila Brooks
Date: 2026-04-22
Renewal risk: Medium
Next meeting: 2026-05-06

Notes
- Customer is expanding usage to the research team.
- Data export questions should go to product operations.
- Legal requested an updated data-processing addendum.

Action items
Owner               Task                              Due date
Leila Brooks        Send QBR deck                     2026-04-25
Product Ops         Confirm export limits             2026-04-29
Legal               Share updated DPA                 2026-05-01
`;

const SUPPORT_ESCALATION = `Support Escalation Brief

Case ID: ESC-2026-118
Customer: Contoso Ltd
Severity: High
Opened: 2026-05-14
Incident owner: Tyler Nguyen
Current status: Waiting on customer logs

Summary
The integration intermittently returns authentication errors after token
rotation. Engineering suspects an environment-specific cache key.

Next steps
- Collect sanitized gateway logs
- Reproduce token rotation in staging
- Confirm whether the customer uses multiple service accounts
`;

/** Plain-text resume shaped like typical PDF uploads; uses fictional names only. */
const GENERIC_RESUME = [
  "Jordan Lee",
  "+1 415 555 0198 | jordan.lee@example.com | linkedin.com/in/jordan-lee | github.com/jordanlee",
  "",
  "SUMMARY",
  "Software engineer focused on web platforms, developer experience, and reliable delivery.",
  "",
  "WORK EXPERIENCE",
  "Northwind Systems Bengaluru, India",
  "Senior Software Engineer May 2025 - Present",
  "- Led UI development for a unified continuous delivery platform",
  "- Designed scalable config-driven architecture for shared components",
  "Software Engineer I May 2022 - Apr 2024",
  "- Managed migration work during a major platform rewrite",
  "Formik",
  "- Migrated legacy forms to Formik for validation consistency",
  "Software Engineer Intern Jan 2022 - June 2022",
  "- Contributed to feature delivery and design implementation",
  "",
  "EDUCATION",
  "Riverside Institute of Technology",
  "B.Tech in Computer and Communication Engineering July 2018 - May 2022",
  "",
  "SKILLS",
  "Languages: JavaScript, TypeScript, HTML, CSS",
  "Frameworks & Libraries: React, Redux, Formik",
  "Tools & Platforms: Git, CI/CD, Cypress",
  "",
  "PROJECT",
  "Atlas Finder",
  "- Developed a dynamic search experience using React and REST APIs",
  "",
  "ACHIEVEMENTS",
  "- Recipient of a merit scholarship for academic performance",
  "- Won an internal hackathon for developer tooling",
].join("\n");

export const NON_INVOICE_DEMOS: DemoDocument[] = [
  {
    id: "generic-project-brief",
    title: "Project brief (Markdown)",
    scenario: "Markdown · inferred schema",
    demonstrates: "Headings, labeled facts, and milestones become a draft schema plus a repeated table.",
    filename: "orbital-cloud-project-brief.md",
    mimeType: "text/markdown",
    content: PROJECT_BRIEF,
    seedState: "approved",
    approve: true,
  },
  {
    id: "generic-release-plan",
    title: "Release plan (Markdown)",
    scenario: "Markdown · review required",
    demonstrates: "Release metadata and launch gates produce a draft schema with reviewable medium-confidence fields.",
    filename: "atlas-search-release-plan.md",
    mimeType: "text/markdown",
    content: RELEASE_PLAN,
  },
  {
    id: "generic-compliance-checklist",
    title: "Compliance checklist (Markdown)",
    scenario: "Markdown · controls table",
    demonstrates: "Control owners and status rows become repeated compliance records.",
    filename: "vendor-onboarding-compliance-checklist.md",
    mimeType: "text/markdown",
    content: COMPLIANCE_CHECKLIST,
  },
  {
    id: "generic-incident-retrospective",
    title: "Incident retrospective (Markdown)",
    scenario: "Markdown · reopened review",
    demonstrates: "An operational narrative with timeline and follow-ups can be approved, then reopened for review.",
    filename: "checkout-latency-retrospective.md",
    mimeType: "text/markdown",
    content: INCIDENT_RETROSPECTIVE,
    seedState: "reopened",
  },
  {
    id: "generic-support-tickets",
    title: "Support tickets (CSV)",
    scenario: "CSV · repeated records",
    demonstrates: "A table-only document becomes reviewable records without invoice-specific columns.",
    filename: "q3-support-tickets.csv",
    mimeType: "text/csv",
    content: SUPPORT_TICKETS,
  },
  {
    id: "generic-subscription-renewals",
    title: "Subscription renewals (CSV)",
    scenario: "CSV · queued extraction",
    demonstrates: "Customer renewal rows show the queued processing state for a generic table upload.",
    filename: "subscription-renewals.csv",
    mimeType: "text/csv",
    content: SUBSCRIPTION_RENEWALS,
    seedState: "queued",
  },
  {
    id: "generic-press-release",
    title: "Press release (TXT)",
    scenario: "TXT · key/value extraction",
    demonstrates: "Plain text contact fields and narrative content become grounded extracted values.",
    filename: "seedling-robotics-press-release.txt",
    mimeType: "text/plain",
    content: PRESS_RELEASE,
  },
  {
    id: "generic-service-summary",
    title: "Service summary (HTML)",
    scenario: "HTML · untrusted source",
    demonstrates: "HTML is stripped to safe canonical text before schema inference and review.",
    filename: "blue-harbor-service-summary.html",
    mimeType: "text/html",
    content: SERVICE_SUMMARY,
  },
  {
    id: "generic-onboarding-plan",
    title: "Onboarding plan (HTML)",
    scenario: "HTML · active processing",
    demonstrates: "HTML workstream tables show a generic document held in the active processing state.",
    filename: "northwind-onboarding-plan.html",
    mimeType: "text/html",
    content: ONBOARDING_PLAN,
    seedState: "processing",
  },
  {
    id: "generic-product-catalog",
    title: "Product catalog (HTML)",
    scenario: "HTML · approved records",
    demonstrates: "Catalog metadata and item rows become trusted generic records for Explore.",
    filename: "spring-field-kit-catalog.html",
    mimeType: "text/html",
    content: PRODUCT_CATALOG,
    seedState: "approved",
    approve: true,
  },
  {
    id: "generic-low-structure-note",
    title: "Low-structure note (TXT)",
    scenario: "TXT · degraded extraction",
    demonstrates: "Sparse prose falls back to reviewable content with an explicit low-structure status.",
    filename: "low-structure-phone-note.txt",
    mimeType: "text/plain",
    content: LOW_STRUCTURE_NOTE,
  },
  {
    id: "generic-meeting-notes",
    title: "Meeting notes (TXT)",
    scenario: "TXT · uploaded only",
    demonstrates: "A plain-text handoff note waits in uploaded state before extraction starts.",
    filename: "fabrikam-cs-handoff-notes.txt",
    mimeType: "text/plain",
    content: MEETING_NOTES,
    seedState: "uploaded",
  },
  {
    id: "generic-support-escalation",
    title: "Support escalation (TXT)",
    scenario: "TXT · failed extraction",
    demonstrates: "A retryable generic text extraction failure appears alongside invoice failures.",
    filename: "contoso-support-escalation.txt",
    mimeType: "text/plain",
    content: SUPPORT_ESCALATION,
    seedState: "failed",
  },
  {
    id: "generic-resume",
    title: "Resume (TXT)",
    scenario: "TXT · built-in Resume schema",
    demonstrates:
      "A CV-style document matches the published Resume schema and extracts profile, experience, education, and skills.",
    filename: "sample-resume.txt",
    mimeType: "text/plain",
    content: GENERIC_RESUME,
    seedState: "approved",
    approve: true,
  },
];

export function getDemoDocumentById(id: string): DemoDocument | null {
  return NON_INVOICE_DEMOS.find((demo) => demo.id === id) ?? null;
}
