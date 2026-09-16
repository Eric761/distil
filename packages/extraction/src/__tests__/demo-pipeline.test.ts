import { describe, expect, it } from "vitest";
import { parseDocument } from "../parsers/index.js";
import { extractStructural } from "../structural/extract.js";

const enc = new TextEncoder();

const MARKDOWN_BRIEF = `# Project Brief: Orbital Cloud Migration

Project name: Orbital Cloud Migration
Owner: Dana Whitfield
Budget: 250000

## Milestones

Milestone          Owner            Due date
Discovery          Dana Whitfield   2026-02-28
Pilot migration    Raj Patel        2026-04-15
`;

const SERVICE_HTML = `<!doctype html>
<html><body>
<h1>Managed Support Service Summary</h1>
<p>Client: Blue Harbor Analytics</p>
<p>Monthly fee: 4800</p>
<table>
<tr><th>Service</th><th>Tier</th></tr>
<tr><td>Incident response</td><td>Priority</td></tr>
<tr><td>Quarterly review</td><td>Standard</td></tr>
</table>
</body></html>
`;

describe("generic document pipeline (parse -> structural extract)", () => {
  it("infers a draft schema with scalars and a table from Markdown", async () => {
    const parse = await parseDocument({ bytes: enc.encode(MARKDOWN_BRIEF), filename: "brief.md" });
    const result = extractStructural(parse);

    // Ad-hoc, unpublished schema proposal — the reusable middle box.
    expect(result.schema.adHoc).toBe(true);
    expect(result.schema.status).toBe("draft");

    // Labeled key/values become grounded scalar fields.
    const owner = result.fields.find((f) => f.label === "Owner");
    expect(owner?.value).toBe("Dana Whitfield");
    expect(owner?.sources[0]?.groundingStatus).toBe("grounded");

    const budget = result.fields.find((f) => f.label === "Budget");
    expect(budget?.type).toBe("integer");

    // The milestones block is detected as an array of objects.
    const arrayDef = result.schema.fields.find((f) => f.nodeKind === "array");
    expect(arrayDef).toBeTruthy();
    expect(result.fields.some((f) => f.schemaFieldKey.includes("[]."))).toBe(true);
  });

  it("parses untrusted HTML into canonical text and extracts fields + table", async () => {
    const parse = await parseDocument({ bytes: enc.encode(SERVICE_HTML), filename: "summary.html" });
    // HTML is reduced to canonical plain text — no markup survives.
    expect(parse.text).not.toMatch(/<[^>]+>/u);
    expect(parse.sourceKind).toBe("text");

    const result = extractStructural(parse);
    const client = result.fields.find((f) => f.label === "Client");
    expect(client?.value).toBe("Blue Harbor Analytics");

    const arrayDef = result.schema.fields.find((f) => f.nodeKind === "array");
    expect(arrayDef?.item?.children?.some((c) => c.label === "Service")).toBe(true);
  });
});
