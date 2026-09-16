# Distil — Document Intelligence from Chaos

Turn messy PDFs, text files, tables, and markup into **trusted, searchable
records** — with schema-driven extraction, human verification, field-level
provenance, and explainable exploration.

|                  |                                                                      |
| ---------------- | -------------------------------------------------------------------- |
| **Live demo**    | [https://distil-mq5q.onrender.com](https://distil-mq5q.onrender.com) |
| **Stack**        | React · Fastify · PostgreSQL · TypeScript                            |
| **Demo data**    | 23 seeded demo documents — 14 text/table/markup samples plus 9 invoice fixtures |
| **Local app**    | [http://localhost:5173](http://localhost:5173) (API on `:4000`)      |
| **Design notes** | [`decisions.md`](decisions.md)                                       |

---

## Contents

- [Quick start](#quick-start)
- [Guided evaluator demo](#guided-evaluator-demo)
- [Product tour](#product-tour)
- [What this is](#what-this-is)
- [Features](#features)
- [Architecture](#architecture)
- [Using the app](#using-the-app)
- [Demo fixtures](#demo-fixtures)
- [Explore examples](#explore-examples)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Deployment](#deployment)
- [Limitations](#limitations)

---

## Quick start

**Prerequisites:** Node.js ≥ 20 · pnpm (Corepack) · PostgreSQL 16 (Docker recommended)

```bash
corepack enable
pnpm install
docker compose up -d db
cp .env.example .env
pnpm db:migrate
pnpm db:seed      # loads mixed demo documents, including 9 invoice fixtures (idempotent)
pnpm dev          # web :5173 · api :4000
```

Then open **http://localhost:5173**.

<details>
<summary><strong>No Docker?</strong></summary>

Point `DATABASE_URL` in `.env` at any PostgreSQL 16 instance, create the database,
then run `pnpm db:migrate`, `pnpm db:seed`, and `pnpm dev`.

</details>

<details>
<summary><strong>Port 5432 already in use?</strong></summary>

Change the host port in `docker-compose.yml` (e.g. `"5433:5432"`) and match it in
`.env`:

```env
DATABASE_URL=postgres://distil:distil@localhost:5433/distil
```

</details>

---

## Guided evaluator demo

**Live:** [https://distil-mq5q.onrender.com](https://distil-mq5q.onrender.com) — a
compact banner on first visit with **Start walkthrough**. Dismiss it or finish the
guide, then reopen anytime via **Evaluator guide** in the header.

Skip local setup? Deploy with [`render.yaml`](render.yaml) — migrate and seed run
automatically on deploy.

1. Open the app → click **Start walkthrough** on the banner.
2. **Greenline Maintenance** — ambiguous invoice number; approval blocked.
3. **Atlas Industrial** — conflicting totals; pick the trusted candidate.
4. **Project brief (Markdown)** — infer a draft schema from headings, labeled facts, and a milestone table.
5. **Support tickets (CSV)** — repeated records become reviewable fields instead of invoice columns.
6. **Service summary (HTML)** — parse untrusted markup as canonical text only, with grounded fields.
7. **Explore** → `Orbital Cloud Migration` or `invoices from Acme above 500 in USD` → open a result’s details.

---

## Product tour

Screenshots follow the same **review → approve → explore** path as the in-app walkthrough.

**1. Documents — evaluator banner (first visit)**

![Documents workspace with the compact evaluator banner and Start walkthrough CTA](docs/screenshots/01-documents-evaluator-banner.png)

**2. Documents — guided walkthrough panel**

![Expanded five-step evaluator walkthrough on the Documents page](docs/screenshots/02-documents-walkthrough-panel.png)

**3. Review queue — prioritized open issues**

![Review queue listing open extraction and validation issues across documents](docs/screenshots/03-review-queue.png)

**4. Review workspace — source, fields, and provenance**

![Split review workspace with invoice PDF, structured fields, and source highlighting](docs/screenshots/04-review-split-workspace.png)

**5. Documents — full library and workspace stats**

![Document library table with extraction status, review state, and workspace summary](docs/screenshots/05-documents-library.png)

**6. Explore — approved records with traceability**

![Explore page with natural-language filters, approved results, and source links](docs/screenshots/06-query-approved-records.png)

**7. Schemas — versioned field definitions**

![Schemas page showing the published Invoice schema with field types, labels, and flags](docs/screenshots/07-schemas-invoice-fields.png)

**8. Documents — upload dialog**

![Upload document modal for PDF, text, markdown, CSV, and HTML files](docs/screenshots/08-documents-upload-dialog.png)

**9. Review workspace — incident retrospective**

![Split review workspace with markdown source, structured incident fields, and schema validation](docs/screenshots/09-review-incident-retrospective.png)

---

## What this is

A document-intelligence platform for turning heterogeneous text-based business
documents into trusted records. Markdown, TXT, CSV, HTML, and text-layer PDFs go
through the same schema-driven trust loop; invoices are a specialized fixture family
with reconciliation and an `invoice_records` projection.

The hard problem is not just extraction. It is **converting uncertain extraction
into trusted data**: choosing the right schema, surfacing uncertainty, proving
where each value came from, preserving corrections, and blocking approval while
material issues remain.

```text
PDF / TXT / Markdown / CSV / HTML
  → persisted upload
  → canonical parse
  → classify + infer or reuse a versioned schema
  → hybrid extraction
  → schema-driven validation
  → confidence-aware review with provenance
  → guarded approval
  → trusted record snapshot
  → Explore with data, JSON, and lineage
```

**Supported formats:** text-layer PDF, TXT, Markdown, CSV, and HTML. Image-only
PDFs are out of scope and fail with an OCR-required error. HTML is parsed as
untrusted input and is never rendered as same-origin markup.

**Hybrid extraction:** the pipeline runs FixtureExtractor → optional gated OpenAI
LlmExtractor → deterministic StructuralExtractor. `OPENAI_API_KEY` unset means no
LLM extractor is constructed or called. The default model is `gpt-4o-mini`;
fixtures never call OpenAI; high-coverage structural results skip OpenAI. LLM
input is capped by `LLM_MAX_PAGES`, `LLM_MAX_INPUT_CHARS`,
`LLM_MAX_INPUT_TOKENS`, `LLM_CHUNK_CHARS`, and `LLM_MAX_CHUNKS`.

---

## Features

**Ingest & process**

- Document library with pagination, filtering, search, and live processing status
- Upload with validation, progress, cancellation, duplicate detection, and format-specific parser errors
- Canonical parsers for text-layer PDF, TXT, Markdown, CSV, and untrusted HTML
- Recoverable async processing with visible phases, retry, partial results, and append-only extraction lineage

**Review & approve**

- Adaptive split workspace: document text/PDF on one side, schema-driven records on the other
- Field-level provenance — quote-then-resolve grounding links values back to source text or PDF regions
- Confidence, validation, and review status as three distinct dimensions
- Edits preserve the original extracted value; confirm / correct / N/A / resolve conflict
- Server-side approval gates — material unresolved fields block approval
- Approved records keep a last-approved snapshot for traceability

**Explore & export**

- Natural language → visible, editable filter chips (unsupported terms are surfaced, never silently applied)
- Generic phrases fall back to a visible Search chip, while recognized financial terms still map to typed filters
- Filter chips are color-toned by constraint type (amount/currency, status, search)
- One row per document (Document · Summary · Review · Issues · Updated) with a details drawer for Data, JSON, and History
- Summary chips report matching count, per-currency totals, and per-schema buckets — currencies are never co-mingled
- Result-to-source traceability from values back to source evidence
- Hardened CSV and JSON export of the full matching set

**Schemas & cross-document workflow**

- Schema inference creates a draft proposal that can be edited, published, and reused
- New generic uploads conservatively match published schemas by field overlap before falling back to ad-hoc inference
- Published schema versions are immutable
- Generic schemas use allowlisted checks such as date ordering and repeated-record completeness
- Review queue ranks issues across all documents by materiality and uncertainty
- **Review next issue** jumps straight to the highest-priority field

---

## Architecture

| Layer  | Technology                                                                   |
| ------ | ---------------------------------------------------------------------------- |
| Web    | React 18, Vite, TanStack Query, React Hook Form, Zod, Tailwind, Radix, pdfjs |
| API    | Node, Fastify, Drizzle ORM, in-process worker                                |
| DB     | PostgreSQL — JSONB raw extraction + typed `extraction_fields` indexes + relational records |
| Shared | `packages/contracts` — Zod schemas for web + API                             |
| Parse  | `packages/extraction` — canonical parsers, structural extraction, LLM gate    |

```text
Production                         Local dev
Browser ─▶ Fastify /api/*          Vite (5173) ─▶ /api proxy ─▶ Fastify (4000)
        └▶ Fastify static (Vite)   Docker Compose → PostgreSQL only
        └▶ Managed PostgreSQL
```

```text
apps/web           React/Vite SPA (documents, review, explore, schemas)
apps/api           Fastify API, Drizzle schema/migrations, worker, services
packages/contracts Zod contracts shared by web + api
packages/extraction Canonical parsers, structural extraction, LLM provider gate
packages/fixtures  Deterministic invoice PDF rendering + fixture profiles
```

---

## Using the app

Nav: **Documents** · **Review queue** · **Explore** · **Schemas**

### Documents

- After `pnpm db:seed`, the library lists **23 mixed demo documents**: 14 Markdown,
  TXT, CSV, and HTML files plus 9 invoice fixtures in varied states.
- The **sample gallery** lets you load built-in generic and invoice samples; each
  card previews the trust challenge it demonstrates.
- **Upload** accepts supported documents ≤ 5 MB: text-layer PDF, TXT, Markdown,
  CSV, and HTML.
- Image-only PDFs persist but fail with an OCR-required error.
- Processing badges update live (`queued → processing → succeeded/partial/failed`).

### Review workspace

- **Open** a processed document → source viewer left, schema-driven record right.
- **Issue navigator** jumps between fields that need attention.
- **View source** highlights the exact evidence when quote-then-resolve grounding
  can locate it.
- **Confirm** / **Correct** / **Not applicable** / **pick a candidate** for conflicts.
- **Save** commits a versioned batch; stale edits show a conflict dialog using
  `expectedExtractionId` and `expectedVersion`.

### Approve

- Approval is gated **server-side**. Try _Greenline_ (missing invoice #) or _Atlas_
  (conflicting total) to see blockers listed with focus links.
- Approved records enter default Explore results and store a last-approved snapshot.
  Editing an approved field **reopens** it.

### Explore

- Type natural language or use an example → **Search** → refine **editable chips**.
- Results show one row per document (Document · Summary · Review · Issues · **Updated**);
  amounts are bucketed per currency in the summary chips, never in a blended column.
- Open a row’s details drawer to inspect **Data**, raw **JSON**, and extraction
  **History**.
- **Export CSV** / **Export JSON** downloads the full matching set.

`/query` redirects to `/explore` for older links.

### Schemas

- Infer a draft schema from new document shapes immediately after processing.
- Review and edit draft proposals before publishing.
- Publish a version to reuse it across matching documents; published versions are
  immutable.

### Review queue

1. Cards show each document’s **top issue**, severity chips, and status.
2. Ranking is materiality-first — a conflicting **total** outranks many low-severity flags.
3. **Review next issue** or **Review** deep-links to the exact field.
4. Resolved documents drop off; all-clear when nothing remains.

Approved and fully-clean documents are omitted from the queue. Failed documents with
no extraction are retried from their review page.

---

## Demo fixtures

Highlighted invoice samples from the seeded library; the full seed also includes
Markdown briefs, TXT notes, CSV tables, and HTML summaries:

| Sample                | Scenario                                               | Outcome                                    |
| --------------------- | ------------------------------------------------------ | ------------------------------------------ |
| Acme Office Supply    | Clean invoice, high confidence                         | Ready to approve fast                      |
| Northstar Logistics   | Terminology variation ("Bill No.", "Issued", "Pay by") | Needs review; source proves normalization  |
| Greenline Maintenance | Missing invoice number                                 | Approval blocked until corrected           |
| Atlas Industrial      | Conflicting totals (invoice total vs. balance due)     | Pick the trusted candidate                 |
| Meridian Components   | 12 EUR line items, qty × unit-price mismatch           | Line-item editing + reconciliation warning |
| Redbrick Consulting   | First attempt fails deterministically                  | **Retry** yields partial extraction        |

Processing uses a persisted state machine with lease-based recovery — if the server
restarts mid-extraction, stuck attempts are re-queued.

---

## Explore examples

Natural language maps to a **fixed, allowlisted** filter set. Approved records are
searched by default.

```
Orbital Cloud Migration
invoices from Acme above 500 in USD
approved invoices over 1000
Spring field kit
Jordan Lee
```

Recognized financial terms map to typed filters (amount, currency, dates, status);
generic phrases become a visible **Search** chip that matches across document text
and fields.
Unparsed terms are listed with a warning — never silently applied. No arbitrary SQL.

---

## Development

```bash
pnpm typecheck    # strict TypeScript (all workspaces)
pnpm test         # Vitest — web + API + extraction
pnpm build        # typecheck + build web bundle
pnpm start        # production: API + built UI on $PORT
```

| Package               | Test locations                                                           |
| --------------------- | ------------------------------------------------------------------------ |
| `apps/web`            | `src/features/**/__tests__/`, `src/components/__tests__/`                |
| `apps/api`            | `src/lib/__tests__/`, `src/services/__tests__/`, `src/routes/__tests__/` |
| `packages/extraction` | `src/__tests__/`                                                         |

Run one workspace: `pnpm --filter @invoice/web test`, `pnpm --filter @invoice/api test`, or `pnpm --filter @invoice/extraction test`.

**Optional OpenAI extraction:**

OpenAI is disabled unless `OPENAI_API_KEY` is set. When enabled, the gated
LlmExtractor uses `OPENAI_MODEL` (default `gpt-4o-mini`) and respects the
document caps in `.env.example`: `LLM_MAX_PAGES`, `LLM_MAX_INPUT_CHARS`,
`LLM_MAX_INPUT_TOKENS`, `LLM_CHUNK_CHARS`, and `LLM_MAX_CHUNKS`.

**Reset database:**

```bash
pnpm db:reset
pnpm db:migrate && pnpm db:seed
```

---

## Troubleshooting

| Symptom                                         | Fix                                                                                                                        |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `Invalid environment configuration`             | `cp .env.example .env` and set `DATABASE_URL`                                                                              |
| Empty document library                          | `pnpm db:migrate && pnpm db:seed`                                                                                          |
| Image-only PDF fails to extract                 | Expected — OCR is out of scope; upload a text-layer PDF or another supported text/table format                            |
| OpenAI is not called                            | Expected when `OPENAI_API_KEY` is unset, the document is a fixture, or structural extraction already has high coverage     |
| API/Vite port in use                            | Change `PORT` in `.env` or Vite’s dev port                                                                                 |
| PostgreSQL port 5432 in use                     | Remap in `docker-compose.yml` + update `DATABASE_URL` (see [Quick start](#quick-start))                                    |
| Render deploy fails health check                | First deploy seed is slow; set Health Check path `/api/health`, raise timeout in Dashboard (see [Deployment](#deployment)) |
| Site shows Render loading screen after idle     | Cold start — keep warm via the `/api/ping` cron ≤10 min; screen is Render's own and unavoidable on free tier (see [Deployment](#deployment)) |
| UptimeRobot shows Down but site loads eventually | Monitor URL or timeout is wrong — use `/api/ping` (not `/documents/`), ≤10-min interval, 90s timeout |
| Loading screen returns mid-month on free tier    | 750 free instance-hours exhausted → service suspended; upgrade to Starter or move SPA to a Static Site |
| Migration "identifier will be truncated" NOTICE | Harmless PostgreSQL notice                                                                                                 |

---

## Deployment

Single same-origin Node service + managed PostgreSQL.

```bash
pnpm install && pnpm build
pnpm db:migrate && pnpm db:seed   # seed is idempotent
pnpm start                        # health: GET /api/health
```

**Render (recommended):** connect the repo and apply [`render.yaml`](render.yaml).
The blueprint provisions Postgres (free tier), runs migrate + seed once per deploy via
`releaseCommand`, and serves API + UI from one origin. On each wake from sleep the
server runs a fast in-process migrate and starts listening immediately — seed does
**not** block cold starts. Uploaded file bytes live in PostgreSQL, so redeploys do
not erase uploads. Seed **skips** when the library already has all demo fixtures; use
`SEED_FORCE=true` or `pnpm db:reset && pnpm db:seed` to rebuild demo state.

**Keep-alive & cold starts (free tier reality):** Render spins a Free web service
**down after 15 minutes** with no inbound traffic. Waking it takes ~1 minute, during
which **Render serves its own loading page** to the browser — this happens *before*
our app is running, so no app code can replace that page. Two things reduce how often
users hit it:

1. **Keep it warm** with a ping to **`/api/ping`** every **≤10 minutes** (5-minute
   safety margin under Render’s 15-minute sleep).

   > **The URL must be the LIVE service host.** Find it in the Render dashboard on
   > the **distil** service page (shown under the service name), e.g.
   > `https://distil-mq5q.onrender.com`. A wrong host returns **404** with header
   > **`x-render-routing: no-server`** — this is the #1 reason a keep-alive silently
   > "does nothing": it's pinging a hostname where no service is deployed.

   **Recommended: external monitor** — [UptimeRobot](https://uptimerobot.com) or
   [cron-job.org](https://cron-job.org): monitor
   `https://<your-service>.onrender.com/api/ping`, interval **5–10 minutes**, timeout
   **90 seconds**, expect **HTTP 200**. Most reliable free option; no GitHub setup.

   **Secondary: GitHub Action** — [`.github/workflows/keep-alive.yml`](.github/workflows/keep-alive.yml)
   pings on a best-effort `schedule` and via a manual **Run workflow** button. GitHub’s
   free cron is sparse (it may skip many ticks), so treat it as a backup, not the
   primary heartbeat. Override the URL with repo variable **`KEEP_ALIVE_URL`**
   (Settings → Secrets and variables → Actions → Variables) so you never have to edit
   the workflow.

   > **Free-tier ceiling:** keeping one service warm ~24/7 uses most of Render’s **750
   > free instance-hours/month**. If exhausted, Render suspends the service until the
   > month resets — upgrade to **Starter ($7/mo, never sleeps)** if that matters.
2. **Wake gracefully in the UI.** Once our SPA shell loads, `WakeGate`
   ([`apps/web/src/app/WakeGate.tsx`](apps/web/src/app/WakeGate.tsx)) polls `/api/ping`
   and shows a **branded "waking the server" loader** (auto-entering when the API
   answers) instead of letting the first data request error out.

| Ping setting | Value |
| ------------ | ----- |
| URL | `https://<your-service>.onrender.com/api/ping` |
| Interval | **10 minutes** (never more than 15) |
| Timeout | 90 seconds |
| Expected status | `200` |

> **Free-tier trade-off:** keeping one service warm ~24/7 consumes most of the **750
> free instance-hours/month**. If you exhaust them, Render **suspends** the service
> until the next month (loading screen returns). For a demo this is usually fine; if
> a guaranteed-instant first load matters, use Render **Starter ($7/mo, never sleeps)**
> or host the SPA as a **Render Static Site** (never sleeps) with the API on free.

**First deploy on Render (free tier):** `releaseCommand` runs migrate + seed before
the new version goes live; the first seed can take **2–5 minutes**. Render probes
`/api/health` only after the port is open. If the deploy fails with a health-check
error:

1. Open the **distil** web service → **Settings** → **Health Checks**.
2. Confirm path is **`/api/health`** (must match `render.yaml`).
3. Increase **Timeout** to **180 seconds** (or the maximum allowed) if the UI offers it.
4. **Manual Deploy** again and watch **Logs** until you see `seed complete` and the
   server listening on port 4000.

Render allows up to **15 minutes** for a deploy to pass health checks before it
cancels. A slow first seed is normal; later wakes are much faster.

**Railway:** PostgreSQL plugin + same env vars; `pnpm build` / `pnpm db:migrate &&
pnpm db:seed` / `pnpm start`.

---

## Limitations

- No OCR for image-only PDFs
- No authentication — approval stores a timestamp, not an actor
- Document bytes in PostgreSQL — fine for a demo; blob table is isolated for future object storage
- In-process worker — single-instance; reliable with lease/recovery, not horizontally scalable
- Multi-currency — amounts are never converted; currency is always shown
- HTML is parsed as untrusted content and never rendered as same-origin markup

Review queue API: `GET /api/review-queue` — same provenance and approval rules as
single-document review.

---

See [`decisions.md`](decisions.md) for rationale, alternatives, and cuts.
