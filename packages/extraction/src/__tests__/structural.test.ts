import { describe, expect, it } from "vitest";
import type { SchemaTree } from "@invoice/contracts";
import { parseCsv } from "../parsers/csv.js";
import { parsePlainText } from "../parsers/text.js";
import { extractStructural, extractStructuralWithSchema } from "../structural/extract.js";
import { resolveQuote } from "../structural/grounding.js";

describe("extractStructural", () => {
  it("extracts labeled key/value pairs as grounded scalar fields", () => {
    const parse = parsePlainText("Purchase Order\n\nSupplier: Initech\nPO Number: PO-9921\nTotal: 4200.00\n");
    const result = extractStructural(parse);

    const supplier = result.fields.find((f) => f.label === "Supplier");
    expect(supplier?.value).toBe("Initech");
    expect(supplier?.sources[0]?.groundingStatus).toBe("grounded");

    const total = result.fields.find((f) => f.label === "Total");
    expect(total?.type).toBe("decimal");
    expect(result.status).toBe("succeeded");
    expect(result.schema.adHoc).toBe(true);
  });

  it("extracts a table as an array of objects with stable schema keys", () => {
    const parse = parseCsv("Name,Role,Salary\nAda,Engineer,120000\nAlan,Researcher,130000\n");
    const result = extractStructural(parse);

    const arrayDef = result.schema.fields.find((f) => f.nodeKind === "array");
    expect(arrayDef).toBeTruthy();
    expect(arrayDef?.item?.children?.map((c) => c.label)).toEqual(["Name", "Role", "Salary"]);

    const cells = result.fields.filter((f) => f.schemaFieldKey.includes("[]."));
    expect(cells.length).toBe(6); // 2 rows x 3 columns
    expect(result.fields.some((f) => f.path.startsWith(`${arrayDef!.key}[0].`))).toBe(true);
    for (const cell of cells) {
      expect(cell.sources[0]?.quote).toBe(String(cell.value));
      expect(cell.sources[0]?.offsetEnd! - cell.sources[0]?.offsetStart!).toBe(String(cell.value).length);
    }
  });

  it("grounds individual cells when extracting against a published table schema", () => {
    const parse = parseCsv("Name,Role\nAda,Engineer\nAlan,Researcher\n");
    const inferred = extractStructural(parse);
    const schema: SchemaTree = {
      ...inferred.schema,
      status: "published",
      version: "v1",
      adHoc: false,
    };
    const result = extractStructuralWithSchema(parse, schema);

    const alan = result.fields.find((field) => field.value === "Alan");
    expect(alan?.sources[0]?.quote).toBe("Alan");
    expect(parse.text.slice(alan?.sources[0]?.offsetStart, alan?.sources[0]?.offsetEnd)).toBe("Alan");
  });

  it("captures unstructured prose as a reviewable content field", () => {
    const parse = parsePlainText("just some rambling prose without any structure at all here.");
    const result = extractStructural(parse);
    expect(result.status).toBe("succeeded");
    expect(result.fields.some((f) => f.schemaFieldKey === "content")).toBe(true);
    expect(result.fields.find((f) => f.schemaFieldKey === "content")?.confidenceReason).toMatch(/section heading/i);
  });

  it("extracts heading-scoped prose and bullet lists for text-heavy documents", () => {
    const parse = parsePlainText(
      `Shreya Joshi\n\nEmail: shreya@example.com\n\nSUMMARY\n\nPlatform engineer with ten years of experience.\n\nWORK EXPERIENCE\n\n- Built payment APIs at Acme Corp\n- Led cloud migration at Beta LLC\n`,
    );
    const result = extractStructural(parse);

    expect(result.schema.key).toBe("resume");
    expect(result.fields.find((f) => f.label === "Email")?.value).toBe("shreya@example.com");
    const summary = result.fields.find((f) => f.path === "summary");
    expect(summary?.value).toMatch(/Platform engineer/);
    const experience = result.fields.find((f) => f.path === "experience[0].description");
    expect(experience?.value).toMatch(/Acme/);
    expect(experience?.value).toMatch(/Beta/);
  });

  it("normalizes resume PDFs into a stable schema instead of heading-derived field keys", () => {
    const parse = parsePlainText(
      [
        "Alex Morgan",
        "+91-9654565763 | alex@example.com | linkedin.com/in/alex-morgan",
        "",
        "WORK EXPERIENCE",
        "Harness",
        "Senior Software Engineer May 2025 - Present",
        "- Led UI development for unified CD platform",
        "- Designed scalable config-driven architecture",
        "",
        "EDUCATION",
        "Manipal University Jaipur",
        "B.Tech in Computer and Communication Engineering July 2018 - May 2022",
        "",
        "SKILLS",
        "Languages: JavaScript, TypeScript, HTML, CSS",
        "Frameworks & Libraries: React, Redux",
        "Tools & Platforms: Git, CI/CD, Cypress",
        "",
        "PROJECT",
        "EaseFind",
        "- Developed a dynamic website using AngularJS",
        "",
        "ACHIEVEMENTS",
        "- Recipient of a 100% scholarship",
        "- Won hackathon at Harness",
      ].join("\n"),
    );

    const result = extractStructural(parse);

    expect(result.schema.key).toBe("resume");
    expect(result.schema.name).toBe("Resume");
    expect(result.schema.fields.map((field) => field.key)).toEqual([
      "candidateName",
      "email",
      "phone",
      "linkedin",
      "github",
      "summary",
      "skills",
      "experience",
      "education",
      "projects",
      "achievements",
    ]);
    expect(result.fields.find((field) => field.path === "candidateName")?.value).toBe("Alex Morgan");
    expect(result.fields.find((field) => field.path === "experience[0].organization")?.value).toBe("Harness");
    expect(result.fields.find((field) => field.path === "experience[0].role")?.value).toBe("Senior Software Engineer");
    expect(result.fields.find((field) => field.path === "experience[0].period")?.value).toBe("May 2025 - Present");
    expect(result.fields.find((field) => field.path === "skills[0].category")?.value).toBe("Languages");
    expect(result.fields.find((field) => field.path === "education[0].institution")?.value).toBe("Manipal University Jaipur");
    expect(result.fields.find((field) => field.path === "education[0].credential")?.value).toBe("B.Tech in Computer and Communication Engineering");
    expect(result.fields.find((field) => field.path === "education[0].period")?.value).toBe("July 2018 - May 2022");
    expect(result.fields.find((field) => field.path === "projects[0].name")?.value).toBe("EaseFind");
    expect(result.fields.find((field) => field.path === "projects[0].description")?.value).toMatch(/AngularJS/);
    expect(result.fields.find((field) => field.path === "achievements[0].text")?.value).toBe("Recipient of a 100% scholarship");
    expect(result.fields.find((field) => field.path === "achievements[1].text")?.value).toBe("Won hackathon at Harness");
    expect(result.fields.some((field) => field.path.includes("seniorSoftwareEngineer"))).toBe(false);
    expect(result.fields.every((field) => field.sources[0]?.groundingStatus === "grounded")).toBe(true);
  });

  it("re-extracts resume values against a selected resume schema instead of returning nulls", () => {
    const parse = parsePlainText(
      [
        "Alex Morgan",
        "+91-9654565763 | alex@example.com | linkedin.com/in/alex-morgan",
        "",
        "WORK EXPERIENCE",
        "Harness",
        "Senior Software Engineer May 2025 - Present",
        "- Led UI development for unified CD platform",
        "",
        "EDUCATION",
        "Manipal University Jaipur",
        "B.Tech in Computer and Communication Engineering July 2018 - May 2022",
        "",
        "SKILLS",
        "Languages: JavaScript, TypeScript, HTML, CSS",
      ].join("\n"),
    );
    const inferred = extractStructural(parse);
    const selectedSchema: SchemaTree = {
      ...inferred.schema,
      status: "published",
      version: "v1",
      adHoc: false,
    };

    const result = extractStructuralWithSchema(parse, selectedSchema);

    expect(result.schema).toBe(selectedSchema);
    expect(result.fields.find((field) => field.path === "candidateName")?.value).toBe("Alex Morgan");
    expect(result.fields.find((field) => field.path === "email")?.value).toBe("alex@example.com");
    expect(result.fields.find((field) => field.path === "experience[0].organization")?.value).toBe("Harness");
    expect(result.fields.find((field) => field.path === "education[0].institution")?.value).toBe("Manipal University Jaipur");
    expect(result.fields.find((field) => field.path === "skills[0].text")?.value).toBe("JavaScript, TypeScript, HTML, CSS");
    expect(result.fields.some((field) => field.value === null && field.path === "candidateName")).toBe(false);
  });

  it("does not promote leaked project or tool headings to experience organizations", () => {
    const parse = parsePlainText(
      [
        "Alex Morgan",
        "alex@example.com",
        "",
        "WORK EXPERIENCE",
        "Harness Bengaluru, India",
        "Senior Software Engineer May 2025 - Present",
        "- Led UI development for unified CD platform",
        "Software Engineer I May 2022 - Apr 2024",
        "- Managed and contributed to the 1st gen product during migration to the new platform",
        "Formik",
        "- Migrated legacy forms to Formik for validation consistency",
        "Software Engineer Intern Jan 2022 - June 2022",
        "- Contributed to features and design implementation",
        "",
        "EDUCATION",
        "Manipal University Jaipur",
        "B.Tech in Computer and Communication Engineering July 2018 - May 2022",
        "",
        "SKILLS",
        "Frameworks & Libraries: React, Redux, Formik",
      ].join("\n"),
    );

    const result = extractStructural(parse);

    expect(result.fields.find((field) => field.path === "experience[0].description")?.value).not.toMatch(/Formik/);
    expect(result.fields.find((field) => field.path === "experience[1].organization")?.value).toBe(
      "Harness Bengaluru, India",
    );
    expect(result.fields.find((field) => field.path === "experience[1].role")?.value).toBe("Software Engineer I");
    expect(result.fields.find((field) => field.path === "experience[1].description")?.value).toMatch(/Formik/);
    expect(result.fields.find((field) => field.path === "experience[2].role")?.value).toBe("Software Engineer Intern");
    expect(result.fields.find((field) => field.path === "experience[2].description")?.value).not.toMatch(/Formik/);
    expect(result.fields.some((field) => field.path.endsWith(".role") && field.value === "Formik")).toBe(false);
    const paths = result.fields.map((field) => field.path);
    expect(paths.length).toBe(new Set(paths).size);
  });

  it("extracts education when the section title is parsed as a plain line", () => {
    const parse = parsePlainText(
      [
        "Alex Morgan",
        "alex@example.com",
        "",
        "WORK EXPERIENCE",
        "Harness Bengaluru, India",
        "Senior Software Engineer May 2025 - Present",
        "- Led UI development for unified CD platform",
        "",
        "EDUCATION",
        "Manipal University Jaipur",
        "B.Tech in Computer and Communication Engineering July 2018 - May 2022",
        "",
        "SKILLS",
        "Languages: JavaScript, TypeScript",
      ].join("\n"),
    );
    const educationTitle = parse.blocks.find((block) => block.text === "EDUCATION");
    if (educationTitle) educationTitle.kind = "line";

    const result = extractStructural(parse);

    expect(result.fields.find((field) => field.path === "education[0].institution")?.value).toBe(
      "Manipal University Jaipur",
    );
    expect(result.fields.find((field) => field.path === "education[0].credential")?.value).toBe(
      "B.Tech in Computer and Communication Engineering",
    );
    expect(result.fields.find((field) => field.path === "education[0].period")?.value).toBe("July 2018 - May 2022");
    expect(result.fields.find((field) => field.path === "experience[0].description")?.value).not.toMatch(/Manipal/);
  });

  it("keeps company, role, education, and awards distinct in compact resume PDFs", () => {
    const parse = parsePlainText(
      [
        "Shreya Joshi",
        "Phone: 5535141681",
        "",
        "Technical Skills",
        "Languages: JavaScript, TypeScript, HTML, CSS, SCSS, JSX, C++",
        "Frameworks/Libraries: React, Redux, Angular",
        "",
        "Work Experience",
        "Morgan Stanley, Bangalore",
        "SDE III - Technology Associate Aug 2025 - Present",
        "- Built an AI-powered WCAG accessibility engineering custom agent",
        "- Designed and built an org-wide reusable HTML report pagination engine",
        "providing internal developer tooling for large complex projects",
        "- Partnered with cross-functional teams across regions",
        "SDE II - Technology Associate Aug 2022 - Jul 2025",
        "- Led Angular v8 to v16 migration",
        "Spring Intern - Technology Analyst Jan 2022 - Jul 2022",
        "- Designed and implemented a reusable UI component library",
        "",
        "Education",
        "DAIICT - Dhirubhai Ambani Institute of Information and Communication Technology Aug 2018 - July 2022",
        "B.Tech in Information & Communication Technology",
        "",
        "Awards and Certificates",
        "- Morgan Stanley GRIT Award for designing a reusable pagination engine",
        "across multiple product teams",
        "- WNIT Individual Recognition Award for solving a critical performance problem",
        "reducing load time from 60 seconds to 6.5 seconds",
        "Tech Showcase Award 2024",
      ].join("\n"),
    );

    const result = extractStructural(parse);

    expect(result.fields.find((field) => field.path === "experience[0].organization")?.value).toBe("Morgan Stanley, Bangalore");
    expect(result.fields.find((field) => field.path === "experience[0].role")?.value).toBe("SDE III - Technology Associate");
    expect(result.fields.find((field) => field.path === "experience[0].description")?.value).toMatch(/providing internal developer tooling/);
    expect(result.fields.find((field) => field.path === "experience[1].organization")?.value).toBe("Morgan Stanley, Bangalore");
    expect(result.fields.find((field) => field.path === "experience[1].role")?.value).toBe("SDE II - Technology Associate");
    expect(result.fields.find((field) => field.path === "experience[2].role")?.value).toBe("Spring Intern - Technology Analyst");
    expect(result.fields.find((field) => field.path === "education[0].institution")?.value).toMatch(/DAIICT/);
    expect(result.fields.find((field) => field.path === "education[0].credential")?.value).toMatch(/B.Tech/);
    expect(result.fields.find((field) => field.path === "achievements[0].text")?.value).toMatch(
      /GRIT Award.*across multiple product teams/,
    );
    expect(result.fields.find((field) => field.path === "achievements[1].text")?.value).toMatch(
      /Individual Recognition.*60 seconds to 6\.5 seconds/,
    );
    expect(result.fields.find((field) => field.path === "achievements[2].text")?.value).toBe("Tech Showcase Award 2024");
    expect(result.fields.filter((field) => field.path.startsWith("achievements[")).length).toBe(3);
  });

  it("handles functional-style resumes with template titles and split experience sections", () => {
    const parse = parsePlainText(
      [
        "Functional Resume Sample",
        "John W. Smith",
        "2002 Front Range Way Fort Collins, CO 80525",
        "john.smith@example.com | (970) 555-0101",
        "",
        "Career Summary",
        "Dedicated early childhood educator with experience in counseling and client services.",
        "",
        "Childcare Experience",
        "Counseling and client services for families in community programs.",
        "",
        "Employment History",
        "Bright Start Learning Center",
        "Lead Teacher Jan 2019 - Present",
        "- Planned curriculum and managed classroom of 18 children",
        "Community Care Agency",
        "Case Worker Jun 2014 - Dec 2018",
        "- Coordinated family support plans and referrals",
        "",
        "Education",
        "University of Arkansas at Little Rock",
        "BS in Early Childhood Development May 2002",
      ].join("\n"),
    );

    const result = extractStructural(parse);

    expect(result.schema.key).toBe("resume");
    expect(result.fields.find((field) => field.path === "candidateName")?.value).toBe("John W. Smith");
    expect(result.fields.find((field) => field.path === "candidateName")?.value).not.toMatch(/Resume Sample/i);
    expect(result.fields.find((field) => field.path === "summary")?.value).toMatch(/early childhood educator/i);
    const organizations = result.fields
      .filter((field) => /^experience\[\d+\]\.organization$/u.test(field.path))
      .map((field) => field.value);
    expect(organizations).toContain("Bright Start Learning Center");
    expect(
      result.fields.some(
        (field) =>
          field.path.startsWith("experience[") &&
          field.path.endsWith(".description") &&
          String(field.value).includes("Community Care"),
      ),
    ).toBe(true);
    expect(result.fields.find((field) => field.path === "education[0].institution")?.value).toMatch(
      /University of Arkansas/,
    );
  });

  it("does not treat prose or template lines as section titles or candidate names", () => {
    const parse = parsePlainText(
      [
        "Jane Doe Resume",
        "Jane Doe | jane@example.com",
        "",
        "years of experience",
        "Led platform work for three years.",
        "",
        "WORK EXPERIENCE",
        "Acme Corp",
        "Engineer Jan 2020 - Present",
      ].join("\n"),
    );

    const result = extractStructural(parse);
    expect(result.fields.find((field) => field.path === "candidateName")?.value).toBe("Jane Doe");
    expect(result.fields.some((field) => field.path === "years of experience")).toBe(false);
    expect(result.fields.find((field) => field.path === "experience[0].organization")?.value).toBe("Acme Corp");
  });
});

describe("resolveQuote", () => {
  it("grounds an exact substring to offsets", () => {
    const parse = parsePlainText("Total due: 4200.00 USD");
    const span = resolveQuote(parse, "4200.00");
    expect(span.groundingStatus).toBe("grounded");
    expect(parse.text.slice(span.offsetStart, span.offsetEnd)).toBe("4200.00");
  });

  it("grounds a whitespace-insensitive quote", () => {
    const parse = parsePlainText("Total:    4200.00");
    const span = resolveQuote(parse, "Total: 4200.00");
    expect(span.groundingStatus).toBe("grounded");
  });

  it("marks an unlocatable quote as unresolved", () => {
    const parse = parsePlainText("nothing to see here");
    const span = resolveQuote(parse, "a value that is not present");
    expect(span.groundingStatus).toBe("unresolved");
  });
});
