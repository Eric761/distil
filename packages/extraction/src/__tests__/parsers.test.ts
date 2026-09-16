import { describe, expect, it } from "vitest";
import { parseCsv } from "../parsers/csv.js";
import { parseHtml } from "../parsers/html.js";
import { parsePlainText } from "../parsers/text.js";
import { parseDocument, detectFormat } from "../parsers/index.js";
import { textLayerToLines } from "../parsers/pdf.js";

describe("detectFormat", () => {
  it("maps extensions and mimes to supported formats", () => {
    expect(detectFormat("a.pdf")).toBe("pdf");
    expect(detectFormat("a.md")).toBe("markdown");
    expect(detectFormat("a.csv")).toBe("csv");
    expect(detectFormat("a.html")).toBe("html");
    expect(detectFormat("a.unknown", "text/plain")).toBe("txt");
    expect(detectFormat("a.bin")).toBeNull();
  });
});

describe("parsePlainText", () => {
  it("detects headings and key/value pairs with grounded offsets", () => {
    const text = "Employment Agreement\n\nEmployer: Globex Corp\nStart Date: 2024-03-01\n";
    const parse = parsePlainText(text);
    expect(parse.sourceKind).toBe("text");

    const kvKeys = parse.keyValues.map((kv) => kv.key);
    expect(kvKeys).toContain("Employer");
    expect(kvKeys).toContain("Start Date");

    const employer = parse.keyValues.find((kv) => kv.key === "Employer")!;
    expect(parse.text.slice(employer.valueOffsetStart, employer.valueOffsetEnd)).toBe("Globex Corp");

    expect(parse.blocks.some((b) => b.kind === "heading" && b.text === "Employment Agreement")).toBe(true);
  });

  it("splits multiple key/value pairs on one line (common on invoice PDFs)", () => {
    const text =
      "Invoice No: FLP/BLR/2425/544356 Invoice Date: 08-01-2025\n" +
      "Seller GSTIN: 29AABCF1234Q1ZS Order ID: OD431244855\n";
    const parse = parsePlainText(text);

    const invoiceNo = parse.keyValues.find((kv) => kv.key === "Invoice No")!;
    expect(invoiceNo.value).toBe("FLP/BLR/2425/544356");
    expect(parse.text.slice(invoiceNo.valueOffsetStart, invoiceNo.valueOffsetEnd)).toBe("FLP/BLR/2425/544356");

    const invoiceDate = parse.keyValues.find((kv) => kv.key === "Invoice Date")!;
    expect(invoiceDate.value).toBe("08-01-2025");

    const sellerGstin = parse.keyValues.find((kv) => kv.key === "Seller GSTIN")!;
    expect(sellerGstin.value).toBe("29AABCF1234Q1ZS");

    const orderId = parse.keyValues.find((kv) => kv.key === "Order ID")!;
    expect(orderId.value).toBe("OD431244855");
  });
});

describe("parseCsv", () => {
  it("parses a header + rows into a single table", () => {
    const csv = "Name,Role,Salary\nAda Lovelace,Engineer,120000\nAlan Turing,Researcher,130000\n";
    const parse = parseCsv(csv);
    expect(parse.tables).toHaveLength(1);
    const table = parse.tables[0]!;
    expect(table.headers).toEqual(["Name", "Role", "Salary"]);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]).toEqual(["Ada Lovelace", "Engineer", "120000"]);
  });

  it("handles quoted fields with commas", () => {
    const csv = 'Item,Note\n"Widget, deluxe","a, b, c"\n';
    const parse = parseCsv(csv);
    expect(parse.tables[0]!.rows[0]).toEqual(["Widget, deluxe", "a, b, c"]);
  });
});

describe("parseHtml", () => {
  it("strips scripts and never leaks executable markup", () => {
    const html = "<html><body><h1>Report</h1><script>alert(1)</script><p>Hello world</p></body></html>";
    const parse = parseHtml(html);
    expect(parse.text).not.toContain("<script>");
    expect(parse.text).not.toContain("alert(1)");
    expect(parse.text).toContain("Hello world");
    expect(parse.blocks.some((b) => b.kind === "heading" && b.text === "Report")).toBe(true);
  });
});

describe("parsePdf", () => {
  it("preserves visual line breaks from positioned text-layer items", () => {
    const text = textLayerToLines([
      {
        str: "Owned frontend development for CD Core and Pipeline modules, delivering business-critical features impacting",
        transform: [1, 0, 0, 1, 72, 700],
        width: 420,
        height: 10,
      },
      {
        str: "enterprise customers",
        transform: [1, 0, 0, 1, 72, 688],
        width: 85,
        height: 10,
      },
    ]);

    expect(text).toBe(
      "Owned frontend development for CD Core and Pipeline modules, delivering business-critical features impacting\nenterprise customers",
    );
  });

  it("splits wrapped continuations that share the same PDF baseline", () => {
    const text = textLayerToLines([
      {
        str: "Owned frontend development for CD Core and Pipeline modules, delivering business-critical features impacting",
        transform: [1, 0, 0, 1, 72, 700],
        width: 420,
        height: 10,
      },
      {
        str: "enterprise customers",
        transform: [1, 0, 0, 1, 72, 700],
        width: 85,
        height: 10,
      },
    ]);

    expect(text).toBe(
      "Owned frontend development for CD Core and Pipeline modules, delivering business-critical features impacting\nenterprise customers",
    );
  });
});

describe("parseDocument", () => {
  it("rejects binary payloads for text formats", async () => {
    const bytes = new Uint8Array([0, 1, 2, 0, 3, 0, 4]);
    await expect(parseDocument({ bytes, filename: "x.txt" })).rejects.toMatchObject({ code: "UNSUPPORTED_FILE" });
  });

  it("rejects unsupported file types", async () => {
    const bytes = new TextEncoder().encode("hello");
    await expect(parseDocument({ bytes, filename: "x.bin" })).rejects.toMatchObject({ code: "UNSUPPORTED_FILE" });
  });

  it("parses a markdown document", async () => {
    const bytes = new TextEncoder().encode("# Title\n\nAuthor: Jane\n");
    const parse = await parseDocument({ bytes, filename: "note.md" });
    expect(parse.keyValues.find((kv) => kv.key === "Author")?.value).toBe("Jane");
  });

  it("normalizes Node Buffer input before calling the PDF parser", async () => {
    const bytes = Buffer.from("%PDF-not-a-real-document");
    try {
      await parseDocument({ bytes, filename: "bad.pdf" });
      throw new Error("expected parser to reject invalid PDF");
    } catch (error) {
      expect(error).toMatchObject({ code: "PARSE_FAILED" });
      expect((error as Error).message).not.toMatch(/rather than `Buffer`/i);
    }
  });
});
