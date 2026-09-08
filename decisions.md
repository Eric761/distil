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
- [The trust loop](#the-trust-loop)
- [Data & storage](#data--storage)
- [Query](#query)
- [Frontend](#frontend)
- [Backend & platform](#backend--platform)

---

## Brief

### Problem

Accounts-payable analysts receive visually inconsistent vendor invoices and must
turn them into records they can trust for payment and downstream reporting.

The obvious framing — *"turn a document into JSON"* — optimizes for machine output
and ignores the real cost:

- deciding whether an extracted value is correct
- resolving missing, ambiguous, or conflicting values
- correcting without losing the original evidence
- knowing when a record is safe to use

**The product answers:** *How can an analyst rapidly convert uncertain extraction
into a trusted record, and later answer operational questions while retaining
evidence for every material value?*

### Hard part

The hard part is **not** extraction. It is converting uncertain extraction into
*trusted* data efficiently:

| Challenge | What it requires |
| --------- | ---------------- |
| Uncertainty | Surfacing what is not yet trustworthy |
| Evidence | Field-level provenance for every material value |
| Corrections | Preserving originals alongside human edits |
| Safety | Blocking approval while material issues remain |
| Search | Natural-language convenience *without* hiding the filters that actually run |

### Slice

One document type (invoices), end to end:

```text
Invoice PDF
  → persisted upload
  → recoverable async extraction
  → confidence-aware review + provenance
  → correction (originals preserved)
  → guarded approval
  → normalized trusted record
  → explainable query
  → result-to-source traceability
```

**Seeded demo library:** 29 synthetic invoices covering every processing state
(uploaded → queued → processing → succeeded / partial / failed) and review state
(needs-review, ready, approved, reopened) — so the review queue, query corpus, and
status filters are populated, not empty.

**Six core trust archetypes** drive the review and query demos:

| Archetype | Example fixture |
| --------- | --------------- |
| Clean, high confidence | Acme Office Supply |
| Terminology variation | Northstar Logistics |
| Ambiguous / missing required field | Greenline Maintenance |
| Conflicting total | Atlas Industrial |
| Line-item mismatch | Meridian Components |
| Recoverable partial extraction | Redbrick Consulting |

### Why this interpretation

A generic *file uploader + JSON* or an *AI chat over documents* demo would show
technology, not the analyst's actual job.

Depth is spent where trust is won or lost — the review workspace, state/recovery
quality, and the explainable query loop — while extraction stays deterministic and
the backend deliberately small.

---

## Product & scope

### Invoice-first, not a generic document platform

> **Chose:** Model one real domain (vendor invoices) end to end.

- **Over:** Generic "any document type" schema; multi-doc-type router.
- **Because:** A concrete domain makes validation, reconciliation, and query meaningful
  (subtotal + tax = total, currency, line items). Breadth would dilute every screen
  into a generic form.
- **Tradeoff:** Not directly reusable for receipts or contracts without new profiles.
- **Cut:** Document-type detection and multi-schema generalization.

### Trust, not extraction accuracy

> **Chose:** Treat human verification of uncertain values as the core product.

- **Over:** Chasing higher OCR/LLM extraction accuracy.
- **Because:** Even perfect extraction needs auditable trust for AP use. Confidence,
  validation, provenance, and guarded approval are the differentiators.
- **Tradeoff:** Less "wow" than a raw AI extractor demo.
- **Cut:** Real OCR/LLM extraction (see fixture simulation below).

---

## The trust loop

### Confidence, validation, and review are separate dimensions

> **Chose:** Keep confidence (extraction certainty), validation (schema/business rules),
> and review state (human decision) as distinct values.

- **Over:** One collapsed "status".
- **Because:** A high-confidence value can still be invalid; a valid value can still
  need review. Collapsing them hides exactly the information analysts need.
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
  not attributed to a user (no auth). Honest gap for a single-analyst demo; the audit
  log is structured to accept an author column later.

### Concurrency: optimistic extraction versioning

> **Chose:** Save and approve carry `expectedVersion`; a mismatch returns a stale-version
> error and the client prompts reload rather than overwriting.

- **Over:** Last-write-wins; row locks held across a review session.
- **Because:** Reviews are think-time-heavy and multi-tab; a monotonic version stops one
  analyst from clobbering another's corrections without locks or a realtime channel.
- **Tradeoff:** Conflicting saves are rejected outright (reload and redo), not merged.
- **Cut:** Field-level merge and collaborative editing.

### Provenance: normalized bounding boxes + source text

> **Chose:** Store 0–1 normalized page coordinates plus source text per field; highlight
> in a controlled PDF viewer.

- **Over:** Absolute pixel boxes; text-only references.
- **Because:** Normalized coordinates are stable across zoom/viewport; source text is an
  accessible, non-visual fallback so the canvas is never the only channel.
- **Tradeoff:** One coordinate-transform utility to maintain.
- **Cut:** Pixel-locked overlays.

### Cross-document review queue: rank the work

> **Chose:** `GET /api/review-queue` returns every non-approved document with open issues,
> each surfacing its single highest-priority issue, an open-issue count, and a deep link
> to that exact field. Priority is a deterministic score: invalid validation outranks
> uncertainty; required/material fields are boosted.

- **Over:** Flat per-field issue list; ordering by open-issue count alone; client-side
  computation over the documents list.
- **Because:** Analysts want the *most consequential* decision next. Server-side ranking
  reuses the same `needs_attention`, confidence, and validation state that gates approval,
  so the queue can never disagree with the review screen.
- **Tradeoff:** A document with many low-severity issues can rank below one with a single
  critical issue (intended); score weights are a fixed heuristic.
- **Cut:** Per-user assignment, saved queue filters, and bulk actions.

---

## Data & storage

### PostgreSQL as the single datastore

> **Chose:** PostgreSQL for everything — JSONB raw extraction, normalized records, and
> PDF bytes.

- **Over:** SQLite, a document store, separate blob store.
- **Because:** JSONB for immutable raw extraction *and* relational normalized records in
  one engine, with strong indexing and transactions.
- **Tradeoff:** Heavier local dependency than SQLite.
- **Cut:** Polyglot persistence.

### Hybrid JSONB + normalized relational

> **Chose:** Immutable raw extraction payload (JSONB) plus normalized field/record/line-item
> tables updated transactionally.

- **Over:** JSONB-only; fully normalized (loses raw evidence).
- **Because:** Keep original evidence forever while making approved data safely queryable
  via typed columns and indexes.
- **Tradeoff:** Two representations can drift.
- **Cut:** Storing only the normalized form. Drift is contained by immutable raw payload +
  extraction version + transactional derived writes.

### Deterministic fixture simulation (not live OCR)

> **Chose:** A deterministic engine renders realistic PDFs and emits pre-authored fields,
> confidence, and source boxes per fixture.

- **Over:** Live OCR/LLM extraction.
- **Because:** Deterministic, testable, and honest about being a demo — while still
  exercising real async processing, persistence, provenance, and recovery.
- **Tradeoff:** Only built-in samples extract; unknown uploads fail by design.
- **Cut:** General extraction (clearly labeled as a demo limitation).

### Money math: fixed-point decimal, never floating point

> **Chose:** Decimal strings over the wire, `numeric` in the DB, BigInt fixed-point for
> reconciliation math.

- **Over:** JS `number` for amounts.
- **Because:** IEEE-754 rounding corrupts subtotal/tax/total reconciliation.
- **Tradeoff:** A small money utility to maintain.
- **Cut:** Floating-point money.

### PDF bytes in PostgreSQL

> **Chose:** Store uploaded PDF bytes in a `bytea` column, isolated in its own table.

- **Over:** Object storage (S3/GCS); local disk.
- **Because:** One durable store — refresh/redeploy never loses uploads, with no extra
  infra for a small demo. The blob table is isolated so object storage can replace it later.
- **Tradeoff:** `bytea` does not scale to large volumes.
- **Cut:** External object storage (documented as the scaling path).

---

## Query

### Natural language → allowlisted filters

> **Chose:** A deterministic interpreter maps text to a fixed set of typed filters; the
> filters (not the text) are the source of truth and are shown as editable chips.

- **Over:** LLM-to-SQL; free-text search.
- **Because:** Convenience without opacity or injection risk. Users see exactly what will
  run and can edit it; unparsed terms are surfaced, never silently applied.
- **Tradeoff:** The parser only understands documented patterns.
- **Cut:** Arbitrary SQL/JSONPath/expression execution from clients.

### Multi-currency: show it, filter on it, never co-mingle it

> **Chose:** Currency always displayed and filterable; aggregates bucketed per currency;
> amounts never summed or converted across currencies.

- **Over:** A single blended total; converting to a base currency at some rate.
- **Because:** A blended "total" across USD/EUR/GBP is a false number for AP and would
  demand an FX rate source and as-of-date policy.
- **Tradeoff:** No single headline figure spanning currencies.
- **Cut:** Currency conversion and a base-currency rollup.

---

## Frontend

### Feature-oriented React/Vite SPA

> **Chose:** Vite + React with feature folders (documents, review, provenance, query) and
> shared UI primitives; no global client store.

- **Over:** Next.js; a Redux-style global store.
- **Because:** Client-heavy SPA behind one API — Next.js SSR adds no value. Server state
  lives in TanStack Query; local UI state stays local.
- **Tradeoff:** Manual routing/data wiring vs. a framework.
- **Cut:** SSR and a global state container.

### TanStack Query + local reducers

> **Chose:** TanStack Query for all server state; a small reducer for the review draft;
> URL params for query/library state.

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
> extraction read/save/approve, query, health — with a persisted in-process worker.

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

### Single same-origin deployment

> **Chose:** Build Vite assets; Fastify serves them with SPA fallback. One Node service +
> managed PostgreSQL.

- **Over:** Separate frontend/API deployments.
- **Because:** Avoids CORS, two release surfaces, and URL configuration for no product
  benefit; local dev keeps a narrow Vite `/api` proxy.
- **Tradeoff:** Web and API share a release and a process.
- **Cut:** Split deployments and cross-origin configuration.

### Testing: workflow- and logic-focused units, no E2E

> **Chose:** Vitest across both apps — RTL + MSW for frontend workflow invariants; backend
> unit tests for money math, validation/approval gating, and query interpretation; one
> Fastify route test for upload rejection. No E2E.

- **Over:** Playwright E2E; exhaustive DB-backed route matrix.
- **Because:** Concentrate tests on behaviors that determine correctness and trust without
  brittle browser automation or a full route-integration suite. Shared contracts,
  migration/seed checks, and deterministic fixtures cover the rest.
- **Tradeoff:** Broad server route coverage and cross-browser behavior stay unguarded.
- **Cut:** E2E automation and a full DB-integration route suite.
