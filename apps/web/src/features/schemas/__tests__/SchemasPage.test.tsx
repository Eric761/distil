import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SchemaFieldDef } from "@invoice/contracts";
import { renderWithProviders } from "@/test/render";
import {
  DRAFT_VERSION_ID,
  INVOICE_VERSION_ID,
  makeSchemaListResponse,
  makeSchemaVersionDetail,
} from "@/test/fixtures";
import { server } from "@/test/msw-server";
import { SchemasPage } from "../SchemasPage";

function mockSchemas() {
  server.use(
    http.get("*/api/schemas", () => HttpResponse.json(makeSchemaListResponse())),
    http.get("*/api/schemas/versions/:versionId", ({ params }) => {
      if (params.versionId === DRAFT_VERSION_ID) {
        return HttpResponse.json(makeSchemaVersionDetail());
      }
      return HttpResponse.json(
        makeSchemaVersionDetail({
          key: "invoice",
          name: "Invoice",
          versionId: INVOICE_VERSION_ID,
          version: "v1",
          status: "published",
          adHoc: false,
          fields: [
            { key: "vendorName", label: "Vendor", type: "string", nodeKind: "scalar", group: "identity", required: true, material: false, isSummary: true },
          ],
        }),
      );
    }),
  );
}

describe("SchemasPage", () => {
  it("lists schema families and treats published versions as immutable", async () => {
    mockSchemas();
    renderWithProviders(<SchemasPage />, { route: "/schemas", path: "*" });

    // Both families render, with the built-in badge on the invoice family.
    expect(await screen.findByText("Invoice")).toBeInTheDocument();
    expect(screen.getByText("Orbital Cloud Migration")).toBeInTheDocument();
    expect(screen.getAllByText("built-in").length).toBeGreaterThanOrEqual(1);

    // The first family's published version is auto-selected and read-only.
    expect(await screen.findByText(/published versions are immutable/i)).toBeInTheDocument();
  });

  it("lets a draft version be published from the library", async () => {
    server.use(http.get("*/api/schemas", () => HttpResponse.json(makeSchemaListResponse())));
    let published = false;
    // The GET reflects server state so a post-publish refetch stays published.
    server.use(
      http.get("*/api/schemas/versions/:versionId", ({ params }) => {
        if (params.versionId === DRAFT_VERSION_ID) {
          return HttpResponse.json(
            makeSchemaVersionDetail(published ? { status: "published", adHoc: false } : {}),
          );
        }
        return HttpResponse.json(
          makeSchemaVersionDetail({
            key: "invoice",
            name: "Invoice",
            versionId: INVOICE_VERSION_ID,
            version: "v1",
            status: "published",
            adHoc: false,
            fields: [
              { key: "vendorName", label: "Vendor", type: "string", nodeKind: "scalar", group: "identity", required: true, material: false, isSummary: true },
            ],
          }),
        );
      }),
      http.post("*/api/schemas/versions/:versionId/publish", ({ params }) => {
        published = params.versionId === DRAFT_VERSION_ID;
        return HttpResponse.json(
          makeSchemaVersionDetail({ status: "published", adHoc: false }),
        );
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<SchemasPage />, { route: "/schemas", path: "*" });

    // Open the inferred draft version.
    const draftButton = await screen.findByText("draft");
    await user.click(draftButton);

    // Draft fields are editable and expose a Publish action.
    expect(await screen.findByLabelText("Label for owner")).toBeInTheDocument();
    const publishBtn = screen.getByRole("button", { name: /publish version/i });
    await user.click(publishBtn);
    const dialog = screen.getByRole("dialog", { name: /publish this schema version/i });
    await user.click(within(dialog).getByRole("button", { name: /^publish$/i }));

    await waitFor(() => expect(published).toBe(true));
    // After publishing, the version becomes immutable.
    expect(await screen.findByText(/published versions are immutable/i)).toBeInTheDocument();
  });

  it("edits a draft field label and saves it", async () => {
    mockSchemas();
    let savedLabel: string | null = null;
    server.use(
      http.patch("*/api/schemas/versions/:versionId", async ({ request }) => {
        const body = (await request.json()) as { fields: Array<{ key: string; label: string }> };
        savedLabel = body.fields.find((f) => f.key === "owner")?.label ?? null;
        return HttpResponse.json(makeSchemaVersionDetail());
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<SchemasPage />, { route: "/schemas", path: "*" });

    await user.click(await screen.findByText("draft"));
    const input = await screen.findByLabelText("Label for owner");
    await user.clear(input);
    await user.type(input, "Project owner");
    await user.click(screen.getByRole("button", { name: /save labels/i }));

    await waitFor(() => expect(savedLabel).toBe("Project owner"));
  });

  it("edits duplicate nested field keys independently by full path", async () => {
    server.use(
      http.get("*/api/schemas", () => HttpResponse.json(makeSchemaListResponse())),
      http.get("*/api/schemas/versions/:versionId", ({ params }) => {
        if (params.versionId !== DRAFT_VERSION_ID) {
          return HttpResponse.json(
            makeSchemaVersionDetail({
              versionId: INVOICE_VERSION_ID,
              status: "published",
              adHoc: false,
            }),
          );
        }
        const child = (label: string) => ({
          key: "text",
          label,
          type: "text" as const,
          nodeKind: "scalar" as const,
          group: "records",
          required: false,
          material: false,
        });
        const collection = (key: string, label: string) => ({
          key,
          label,
          type: "array" as const,
          nodeKind: "array" as const,
          group: key,
          required: false,
          material: false,
          item: {
            key: `${key}Item`,
            label: `${label} item`,
            type: "object" as const,
            nodeKind: "object" as const,
            group: key,
            required: false,
            material: false,
            children: [child(`${label} text`)],
          },
        });
        return HttpResponse.json(
          makeSchemaVersionDetail({
            fields: [
              collection("experienceEntries", "Experience"),
              collection("educationEntries", "Education"),
            ],
          }),
        );
      }),
    );

    let savedFields: SchemaFieldDef[] = [];
    server.use(
      http.patch("*/api/schemas/versions/:versionId", async ({ request }) => {
        const body = (await request.json()) as { fields: typeof savedFields };
        savedFields = body.fields;
        return HttpResponse.json(makeSchemaVersionDetail({ fields: body.fields }));
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<SchemasPage />, { route: "/schemas", path: "*" });
    await user.click(await screen.findByText("draft"));

    const experience = await screen.findByLabelText("Label for experienceEntries.text");
    await user.clear(experience);
    await user.type(experience, "Achievement");
    await user.click(screen.getByRole("button", { name: /save labels/i }));

    await waitFor(() => expect(savedFields.length).toBe(2));
    expect(savedFields[0]?.item?.children?.[0]?.label).toBe("Achievement");
    expect(savedFields[1]?.item?.children?.[0]?.label).toBe("Education text");
  });
});
