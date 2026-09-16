# Design Decisions — Distil (Structure from Chaos)

A running log of product and engineering judgment: what was chosen, what was rejected,
and what was deliberately cut.

**How to read each decision**

| Label | Meaning |
| ----- | ------- |
| **Chose** | What we actually built |
| **Over** | Serious alternatives considered |
| **Because** | Why, including tradeoffs accepted |
| **Cut** | What we intentionally left out |

---

## Contents

- [Brief](#brief)
  - [Problem](#problem)
  - [Hard part](#hard-part)
  - [Slice](#slice)
  - [Why this interpretation](#why-this-interpretation)
- [Product & scope](#product--scope)
- [Ingestion & extraction](#ingestion--extraction)
- [Schemas](#schemas)
- [The trust loop](#the-trust-loop)
- [Data & storage](#data--storage)
- [Explore](#explore)
- [Frontend](#frontend)
- [Backend & platform](#backend--platform)

> **Reading order:** the [Brief](#brief) states the current problem. The sections
> that follow are the accumulated product and engineering decisions behind that
> problem statement, including scope changes and refinements folded into the
> current product shape.

---

## Brief

### Problem

Operators receive visually inconsistent text-based business documents — invoices,
briefs, plans, tickets, tables, and markup — and must turn them into records
they can trust for reporting, review, payment workflows, and downstream work.

The obvious framing — *"turn a document into JSON"* — optimizes for machine output
and ignores the real cost:

- choosing the right schema for an unfamiliar document shape
- deciding whether an extracted value is correct
- resolving missing, ambiguous, or conflicting values
- correcting without losing the original evidence
- knowing when a record is safe to use

**The product answers:** *How can an operator rapidly convert uncertain extraction
from any supported document into a trusted record, and later answer operational
questions while retaining evidence for every material value?*

> Distil is a schema-driven document-intelligence platform for supported text-based
> documents. Invoices are a specialized fixture family with reconciliation and an
> `invoice_records` projection, not the limit of the product.

### Hard part

The hard part is **not** extraction. It is converting uncertain extraction into
*trusted* data efficiently:

| Challenge | What it requires |
| --------- | ---------------- |
| Schema | Choosing, reusing, or inferring the right schema for a document shape |
| Uncertainty | Surfacing what is not yet trustworthy |
| Evidence | Field-level provenance for every material value |
| Corrections | Preserving originals alongside human edits |
| Safety | Blocking approval while material issues remain |
| Search | Natural-language convenience *without* hiding the filters that actually run |

### Slice

Text-based document types, end to end — PDFs with text layers plus TXT, Markdown,
CSV, and HTML:

```text
PDF / TXT / Markdown / CSV / HTML
  → persisted upload
  → canonical parse
  → classify + infer or reuse a versioned schema
  → hybrid extraction (fixture or structural, with gated LLM assist)
  → schema-driven validation
  → confidence-aware review + provenance
  → correction (originals preserved)
  → guarded approval
  → trusted record snapshot
  → explainable Explore
  → result-to-source traceability
```

**Seeded demo library:** 23 synthetic documents — 14 Markdown, TXT, CSV, and HTML
samples plus 9 curated invoice fixtures — covering every processing state
(uploaded → queued → processing → succeeded / partial / failed) and review state
(needs_review, ready, approved, reopened), so the review queue, Explore corpus, and
status filters are populated, not empty.

**Six core trust archetypes** appear across the review and Explore demos; the
invoice fixtures provide concrete financial examples:

| Archetype | Example fixture |
| --------- | --------------- |
| Clean, high confidence | Acme Office Supply |
| Terminology variation | Northstar Logistics |
| Ambiguous identifier | Greenline Maintenance |
| Conflicting total | Atlas Industrial |
| Line-item mismatch | Meridian Components |
| Recoverable partial extraction | Redbrick Consulting |

The 14 text/table/markup samples carry the product beyond those invoice examples:
schema inference from headings and labeled facts, repeated records in CSVs, and
untrusted HTML parsed as canonical text, so mixed-schema review and Explore are
exercised directly.

### Why this interpretation

A generic *file uploader + JSON* or an *AI chat over documents* demo would show
technology, not the operator's actual job.

Depth is spent where trust is won or lost — schema selection, the review workspace,
state/recovery quality, and the explainable Explore loop — while extraction stays
deterministic-first (with an optional, gated LLM assist) and the backend
deliberately small.

---

## Product & scope

### Text-based document intelligence with invoice specialization

> **Chose:** Build a schema-driven platform for supported text-based business
> documents, with invoices handled as a specialized domain rather than the product
> boundary.

- **Over:** An invoice-only app; a fully generic "any document" tool that treats every
  upload as untyped JSON.
- **Because:** Text-layer documents, Markdown, CSV, and HTML are where the generalized
  schema lifecycle is visible: parse canonical content, infer or reuse fields, validate
  declared rules, and preserve provenance. Invoices remain useful because they add
  concrete financial invariants (subtotal + tax = total, currency, line items) without
  defining the whole product.
- **Tradeoff:** The product carries both generic schema concepts and invoice-specific
  projections/rules.
- **Cut:** A pure invoice-only scope and an unconstrained document router with no
  declared schema lifecycle.

### Trust, not extraction accuracy

> **Chose:** Treat human verification of uncertain values as the core product,
> supported by deterministic-first hybrid extraction.

- **Over:** Chasing higher OCR/LLM extraction accuracy.
- **Because:** Even perfect extraction needs auditable trust for operational use. Confidence,
  validation, provenance, schema fit, and guarded approval are the differentiators.
- **Tradeoff:** Less "wow" than a raw AI extractor demo.
- **Cut:** OCR for image-only PDFs and any extraction path that hides uncertainty from
  review.

### Cross-format demo corpus

> **Chose:** Seed 23 documents — 14 Markdown, TXT, CSV, and HTML samples plus 9
> curated invoice fixtures — across processing and review states.

- **Over:** A large invoice-only library; an empty initial workspace.
- **Because:** The corpus must demonstrate schema inference, repeated records,
  structural extraction, mixed-schema Explore results, recovery, and approval without
  requiring setup. The invoice set retains the six high-value trust archetypes while
  the larger cross-format set demonstrates the general product.
- **Tradeoff:** Fewer invoice permutations are included out of the box.
- **Cut:** Demo breadth that adds seed cost without exercising a distinct workflow.

---

## Ingestion & extraction

### Canonical text-first parsing

> **Chose:** Parse text-layer PDF, TXT, Markdown, CSV, and HTML into one canonical
> content model before classification and extraction.

- **Over:** A separate extraction pipeline for every file type; rendering uploaded HTML
  directly in the application.
- **Because:** A canonical representation lets schema inference, structural extraction,
  provenance, and search work consistently across formats. HTML is treated as
  untrusted input and reduced to safe canonical text instead of being rendered
  same-origin.
- **Tradeoff:** Format-specific layout and styling are intentionally discarded outside
  the controlled PDF viewer.
- **Cut:** Image-only PDF OCR, executable uploaded markup, and unsupported binary formats.

### Deterministic-first hybrid extraction

> **Chose:** Use deterministic pre-authored extraction for known fixtures and
> structural extraction for other supported documents, with an optional gated LLM
> assist when structural coverage is insufficient.

- **Over:** Fixture-only simulation; invoking OCR or an LLM for every upload.
- **Because:** Fixtures remain reproducible and cost-free, while generic documents still
  become reviewable records. Model use is disabled without `OPENAI_API_KEY`, bounded by
  document caps, and skipped when deterministic extraction already has sufficient
  coverage.
- **Tradeoff:** Low-structure documents may produce partial results, and image-only PDFs
  fail with an explicit OCR-required error.
- **Cut:** Unbounded model calls and extraction that presents uncertain output as fact.

---

## Schemas

### Infer drafts, publish immutable versions

> **Chose:** Infer a draft schema for unfamiliar document shapes and optionally publish
> an immutable version for reuse, with conservative matching to existing published
> schemas before falling back to a new draft.

- **Over:** One global schema; opaque per-document schemas that cannot be reviewed;
  mutating a published schema in place.
- **Because:** Drafts capture inferred shape without locking history; published versions
  stay fixed so past extractions and approvals remain interpretable. New uploads match
  published schemas by field overlap only when the fit is strong enough.
- **Tradeoff:** Schema review adds a lifecycle and versioning model that operators must
  understand.
- **Cut:** Silent schema replacement and forced matching to a weakly related schema.

### Declared, allowlisted validation rules

> **Chose:** Attach validation rules to schemas and execute only rules from a declared
> server-side registry.

- **Over:** Hard-coding every rule into the invoice workflow; accepting arbitrary
  client-supplied expressions.
- **Because:** Generic schemas need reusable checks such as date ordering and repeated
  record completeness, while financial schemas retain reconciliation without applying
  it to unrelated documents.
- **Tradeoff:** Adding a new rule requires an explicit registry implementation.
- **Cut:** Arbitrary rule execution and invoice reconciliation on non-financial schemas.

### First-class schema management in the product

> **Chose:** Expose schema lifecycle in the app as a dedicated **Schemas** area and
> in-review **schema controls**, not only as backend inference.

- **Over:** Hidden schema APIs; forcing operators to fix field mismatches only by editing
  extracted values with no view of the schema itself.
- **Because:** Operators need to inspect and change the schema in the same session as
  field review. The Schemas page browses families and versions; the review workspace
  edits draft fields, selects a published version for re-extraction, and publishes drafts
  when the shape is ready — without bypassing the immutability rules above.
- **Tradeoff:** Schema editing appears in two places (library and document review) and
  must stay consistent with server immutability rules for published versions.
- **Cut:** Schema changes limited to seed data or manual database edits.

---

## The trust loop

### Confidence, validation, and review are separate dimensions

> **Chose:** Keep confidence (extraction certainty), validation (schema/business rules),
> and review state (human decision) as distinct values.

- **Over:** One collapsed "status".
- **Because:** A high-confidence value can still be invalid; a valid value can still
  need review. Collapsing them hides exactly the information operators need.
- **Tradeoff:** More states to render and reason about.
- **Cut:** A single traffic-light status.

### Verification: field-level and document-level

> **Chose:** Compute per-field attention and per-document review status server-side.

- **Over:** Client-derived status; approve-anything.
- **Because:** The server is the source of truth for what blocks approval; the client
  cannot bypass it.
- **Tradeoff:** Some duplicated display logic on the client.
- **Cut:** Trusting client-side validation for approval.

### Corrections: preserve originals, log every change, reopen on edit

> **Chose:** Corrections write to `corrected_value` (extracted value never overwritten);
> every action appends to an immutable `field_corrections` log; editing an approved
> document reopens it instead of silently mutating a trusted record.

- **Over:** Overwrite values in place; let approved records be edited without status change.
- **Because:** The promise is *trusted* data with retained evidence — the original reading,
  the human change, and which-change-against-which-version must all survive.
- **Tradeoff:** More rows and lifecycle states to carry.
- **Cut:** Actor identity — corrections and approvals are timestamped and versioned but
  not attributed to a user (no auth). Honest gap for a single-operator demo; the audit
  log is structured to accept an author column later.

### Concurrency: optimistic extraction versioning

> **Chose:** Save and approve carry both `expectedExtractionId` and
> `expectedVersion`; a mismatch returns a stale-version error and the client prompts
> reload rather than overwriting.

- **Over:** Last-write-wins; row locks held across a review session.
- **Because:** Reviews are think-time-heavy and multi-tab; the extraction identity
  prevents edits against a replaced extraction, while its monotonic version prevents
  one reviewer from clobbering another's corrections without locks or a realtime
  channel.
- **Tradeoff:** Conflicting saves are rejected outright (reload and redo), not merged.
- **Cut:** Field-level merge and collaborative editing.

### Provenance: PDF regions + text offsets

> **Chose:** Store source text with normalized page regions for PDFs and character
> offsets into canonical content for text-based documents.

- **Over:** Absolute pixel boxes; text-only references with no resolvable source
  location.
- **Because:** Normalized coordinates remain stable across PDF zoom and viewport size;
  offsets let the safe text viewer highlight evidence in TXT, Markdown, CSV, HTML, and
  canonicalized content. Source text remains an accessible fallback for both.
- **Tradeoff:** Two source-location strategies must share one provenance contract.
- **Cut:** Pixel-locked overlays and rendering uploaded HTML as evidence.

### Approval creates a stable trusted snapshot

> **Chose:** Preserve append-only extraction lineage and record the last approved
> extraction as a stable snapshot.

- **Over:** Treating the mutable current extraction as the approved record; replacing
  prior extraction history.
- **Because:** Review corrections may continue after approval. A stable approved
  snapshot makes it possible to distinguish what was trusted from what is currently
  being edited and to trace either state back to evidence.
- **Tradeoff:** Current and approved state can intentionally diverge until the document
  is approved again.
- **Cut:** Approval without retained lineage.

### Cross-document review queue: rank the work

> **Chose:** `GET /api/review-queue` returns every non-approved document with open issues,
> each surfacing its single highest-priority issue, an open-issue count, and a deep link
> to that exact field. Priority is a deterministic score: invalid validation outranks
> uncertainty; required/material fields are boosted.

- **Over:** Flat per-field issue list; ordering by open-issue count alone; client-side
  computation over the documents list.
- **Because:** Reviewers want the *most consequential* decision next. Server-side ranking
  reuses the same `needs_attention`, confidence, and validation state that gates approval,
  so the queue can never disagree with the review screen.
- **Tradeoff:** A document with many low-severity issues can rank below one with a single
  critical issue (intended); score weights are a fixed heuristic.
- **Cut:** Per-user assignment, saved queue filters, and bulk actions.

---

## Data & storage

### PostgreSQL as the single datastore

> **Chose:** PostgreSQL for everything — JSONB raw extraction, normalized records, and
> uploaded source bytes.

- **Over:** SQLite, a document store, separate blob store.
- **Because:** JSONB for immutable raw extraction *and* relational normalized records in
  one engine, with strong indexing and transactions.
- **Tradeoff:** Heavier local dependency than SQLite.
- **Cut:** Polyglot persistence.

### Hybrid JSONB + normalized relational

> **Chose:** Keep immutable raw extraction payloads in JSONB, typed and indexed values
> in `extraction_fields`, and approved record snapshots in relational projections.

- **Over:** JSONB-only; fully normalized storage that loses raw evidence; a separate
  generic value subsystem.
- **Because:** Keep original evidence forever while making approved data safely queryable
  via typed columns and indexes. Generic documents use `document_records`; financial
  documents can additionally populate `invoice_records`.
- **Tradeoff:** Two representations can drift.
- **Cut:** Storing only the normalized form. Drift is contained by immutable raw payload +
  extraction version + transactional derived writes.

### Money math: fixed-point decimal, never floating point

> **Chose:** Decimal strings over the wire, `numeric` in the DB, BigInt fixed-point for
> reconciliation math.

- **Over:** JS `number` for amounts.
- **Because:** IEEE-754 rounding corrupts subtotal/tax/total reconciliation.
- **Tradeoff:** A small money utility to maintain.
- **Cut:** Floating-point money.

### Source bytes in PostgreSQL

> **Chose:** Store every uploaded source file as `bytea`, isolated in its own table.

- **Over:** Object storage (S3/GCS); local disk.
- **Because:** One durable store — refresh/redeploy never loses uploads, with no extra
  infra for a small demo. The blob table is isolated so object storage can replace it later.
- **Tradeoff:** Database-backed blobs do not scale to large document volumes.
- **Cut:** External object storage (documented as the scaling path).

---

## Explore

> **Current surface:** cross-document analysis lives in **Explore**; `/query`
> redirects to `/explore` for compatibility. The filter and multi-currency decisions
> below still define how natural-language search becomes trusted, inspectable queries.

### Natural language → allowlisted filters

> **Chose:** A deterministic interpreter maps recognized language to allowlisted
> filters, while explicit schema-scoped field predicates support structured
> cross-document analysis. The filters, not the original text, are the source of truth
> and are shown as editable chips.

- **Over:** LLM-to-SQL; arbitrary client operators; free-text search as the only query
  model.
- **Because:** Convenience without opacity or injection risk. Users see exactly what will
  run and can edit it. When no typed filter is recognized, remaining terms become a
  visible Search filter; when typed filters exist, unmatched terms are reported as
  ignored and require acknowledgement rather than being silently applied.
- **Tradeoff:** The parser only understands documented patterns.
- **Cut:** Arbitrary SQL/JSONPath/expression execution from clients.

### Approved snapshots by default, current values by choice

> **Chose:** Explore reads last-approved snapshots by default and offers an explicit
> current-values scope for in-progress work.

- **Over:** Always querying mutable current extraction values; hiding unapproved records
  completely.
- **Because:** Default results should represent what a reviewer actually trusted, while
  the current scope is still useful for investigation before approval. Keeping the
  scopes explicit prevents draft corrections from silently changing approved reports.
- **Tradeoff:** Two views of the same document can differ until it is approved again.
- **Cut:** Blending approved and current values into one ambiguous result set.

### Multi-currency: show it, filter on it, never co-mingle it

> **Chose:** Currency always displayed and filterable; aggregates bucketed per currency;
> amounts never summed or converted across currencies.

- **Over:** A single blended total; converting to a base currency at some rate.
- **Because:** A blended "total" across USD/EUR/GBP is a false number for financial
  operations and would demand an FX rate source and as-of-date policy.
- **Tradeoff:** No single headline figure spanning currencies.
- **Cut:** Currency conversion and a base-currency rollup.

### Mixed-schema results favor universal signals

> **Chose:** Show one row per document with its summary, review state, open issues, and
> last update; place matching counts, per-currency totals, and schema composition above
> the result set.

- **Over:** Keeping an invoice-only amount column in every row; one blended headline
  total; showing every schema bucket regardless of relevance.
- **Because:** Summary, review state, issues, and recency apply to every schema. Currency
  totals remain useful at result-set level when bucketed correctly, while schema
  summaries explain mixed or non-financial result sets without implying missing data.
- **Tradeoff:** A document-specific financial amount is inspected in its details rather
  than occupying a universal table column.
- **Cut:** Empty invoice-shaped columns for non-financial documents and cross-currency
  totals.

### Result details and export

> **Chose:** Open any result row into a details drawer with **Data**, raw **JSON**, and
> extraction **History**, and export the full matching result set as CSV or JSON—not
> only the current page.

- **Over:** Table-only Explore with no inspectable record; exporting whatever happens to
  be visible on screen.
- **Because:** Operators need to verify trusted values, inspect the underlying record,
  and see how extractions evolved without leaving Explore. Exports must reflect the same
  filters and trust scope as the query, including rows beyond pagination.
- **Tradeoff:** Large exports require fetching all matching rows client-side or via the
  API before download.
- **Cut:** Opaque downloads with no lineage view and page-limited export.

---

## Frontend

### Feature-oriented React/Vite SPA

> **Chose:** Vite + React with feature folders for documents, review, provenance,
> review queue, schemas, and Explore, plus shared UI primitives; no global client
> store.

- **Over:** Next.js; a Redux-style global store.
- **Because:** Client-heavy SPA behind one API — Next.js SSR adds no value. Server state
  lives in TanStack Query; local UI state stays local.
- **Tradeoff:** Manual routing/data wiring vs. a framework.
- **Cut:** SSR and a global state container.

### TanStack Query + local reducers

> **Chose:** TanStack Query for all server state; a small reducer for the review draft;
> URL params for Explore/library state.

- **Over:** Global store for everything; local component state only.
- **Because:** Caching, polling, invalidation, and stale-version handling come for free;
  drafts are ephemeral and belong in a reducer.
- **Tradeoff:** Two state mechanisms to understand.
- **Cut:** A monolithic client store.

### Polling over websockets for processing

> **Chose:** Conditionally poll document/extraction status; pause on terminal states and
> hidden tabs.

- **Over:** WebSockets / SSE.
- **Because:** Simpler operationally for a single-instance demo; the processing window is
  short and deterministic.
- **Tradeoff:** Slightly less "instant" than push.
- **Cut:** A realtime transport.

---

## Backend & platform

### Thin Fastify API + in-process worker

> **Chose:** Small API surface — ingestion, listing/detail/content, process/retry,
> extraction read/save/approve, explore/query, health — with a persisted in-process worker.

- **Over:** Microservice split; external queue.
- **Because:** Product value is in the frontend trust loop; the backend only needs to be
  correct, transactional, and recoverable.
- **Tradeoff:** Not horizontally scalable as-is.
- **Cut:** Distributed queue and service decomposition (lease/recovery semantics make a
  single instance reliable enough).

### Shared Zod contracts (`packages/contracts`)

> **Chose:** One Zod package holds schemas and inferred types for every request/response,
> imported by both API and web.

- **Over:** Hand-written TypeScript interfaces duplicated per app; codegen from DB or OpenAPI.
- **Because:** One schema validates at the API boundary and types the client — a contract
  change surfaces as a compile error, not a runtime surprise.
- **Tradeoff:** A shared package to version and build within the monorepo.
- **Cut:** Codegen from OpenAPI/DB and per-app duplicated types.

### Extraction as a separate domain package

> **Chose:** Keep canonical parsers, structural extraction, provenance primitives, and
> the model gate in `packages/extraction`, separate from API orchestration.

- **Over:** Embedding every parser and extraction strategy directly in the Fastify
  service.
- **Because:** Parsing and extraction are domain logic with their own deterministic
  tests and provider boundary; the API should coordinate persistence, processing, and
  review rather than own format-specific algorithms.
- **Tradeoff:** Another workspace package and contract boundary to maintain.
- **Cut:** Provider-specific model calls spread through route and processing code.

### Single same-origin deployment

> **Chose:** Build Vite assets; Fastify serves them with SPA fallback. One Node service +
> managed PostgreSQL.

- **Over:** Separate frontend/API deployments.
- **Because:** Avoids CORS, two release surfaces, and URL configuration for no product
  benefit; local dev keeps a narrow Vite `/api` proxy.
- **Tradeoff:** Web and API share a release and a process.
- **Cut:** Split deployments and cross-origin configuration.

### Testing: workflow- and logic-focused units

> **Chose:** Vitest across the web, API, and extraction workspaces.

- **Over:** Exhaustive DB-backed route matrix; testing only at the UI shell.
- **Because:** Behaviors that determine correctness and trust get direct coverage;
  shared contracts, migration/seed checks, and deterministic fixtures keep runs
  reproducible.
- **Tradeoff:** Not every HTTP route is exercised through a full database integration
  path.
- **Cut:** An exhaustive server route matrix backed by live DB for every endpoint.

**Coverage:**

- **Web:** React Testing Library and MSW for feature workflow invariants (documents,
  review, Explore, schemas, review queue).
- **API:** Unit tests for money math, validation and approval gating, query
  interpretation; focused Fastify route tests (upload validation, health).
- **Extraction:** Parser, structural extraction, and LLM-gate unit tests in
  `packages/extraction`.
