import type { FastifyInstance } from "fastify";
import {
  approveRequest,
  documentListQuery,
  processRequest,
  saveExtractionRequest,
  ERROR_CODES,
} from "@invoice/contracts";
import { detectFormat } from "@invoice/extraction";
import { AppError, badRequest, notFound } from "../lib/errors.js";
import {
  getDocumentContent,
  getDocumentDetail,
  getDocumentParse,
  ingestSample,
  ingestUpload,
  listDocuments,
} from "../services/document-service.js";
import { getDocumentHistory } from "../services/history-service.js";
import { enqueueProcessing } from "../services/processing-service.js";
import { getSamples } from "../services/profiles.js";
import {
  approveDocument,
  getExtractionDetail,
  saveExtraction,
} from "../services/review-service.js";

const uuidParam = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function assertUuid(id: string): string {
  if (!uuidParam.test(id)) throw badRequest("Invalid document id.");
  return id;
}

export async function documentRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/documents", async (request) => {
    const query = documentListQuery.parse(request.query);
    return listDocuments(query);
  });

  app.get("/api/documents/samples", async () => {
    return { samples: await getSamples() };
  });

  app.post("/api/documents", async (request, reply) => {
    const file = await request.file();
    if (!file) throw badRequest("No file was uploaded.");

    // Accept the supported document family (PDF, TXT, Markdown, CSV, HTML) by
    // filename or MIME. octet-stream is tolerated when the extension resolves.
    const mime = file.mimetype.toLowerCase();
    const resolvableMime =
      mime === "application/octet-stream" || mime === "binary/octet-stream" ? undefined : mime;
    if (!detectFormat(file.filename, resolvableMime)) {
      await file.toBuffer().catch(() => undefined);
      throw new AppError({
        code: ERROR_CODES.UNSUPPORTED_FILE,
        status: 400,
        title: "Unsupported file",
        detail: "Supported document types: PDF, TXT, Markdown, CSV, HTML.",
      });
    }

    let bytes: Buffer;
    try {
      bytes = await file.toBuffer();
    } catch {
      throw new AppError({
        code: ERROR_CODES.FILE_TOO_LARGE,
        status: 413,
        title: "File too large",
        detail: "This file exceeds the upload size limit.",
      });
    }
    if (file.file.truncated) {
      throw new AppError({
        code: ERROR_CODES.FILE_TOO_LARGE,
        status: 413,
        title: "File too large",
        detail: "This file exceeds the upload size limit.",
      });
    }

    const result = await ingestUpload({
      filename: file.filename,
      mimeType: file.mimetype,
      bytes,
      autoProcess: true,
    });

    if (result.duplicate) {
      throw new AppError({
        code: ERROR_CODES.DUPLICATE_DOCUMENT,
        status: 409,
        title: "Already uploaded",
        detail: "This exact document was already uploaded. Open the existing record instead.",
        meta: { document: result.document },
      });
    }

    return reply.status(201).send({
      document: result.document,
      duplicate: false,
    });
  });

  app.post<{ Params: { fixtureId: string } }>("/api/documents/samples/:fixtureId", async (request, reply) => {
    const result = await ingestSample(request.params.fixtureId);
    return reply.status(result.duplicate ? 200 : 201).send({
      document: result.document,
      duplicate: result.duplicate,
    });
  });

  app.get<{ Params: { id: string } }>("/api/documents/:id", async (request) => {
    return getDocumentDetail(assertUuid(request.params.id));
  });

  app.get<{ Params: { id: string } }>("/api/documents/:id/content", async (request, reply) => {
    const { filename, mimeType, bytes } = await getDocumentContent(assertUuid(request.params.id));
    const safeName = filename.replace(/[^\w.\-]+/gu, "_");
    const isPdf = mimeType.toLowerCase().includes("pdf") || filename.toLowerCase().endsWith(".pdf");
    // PDFs render inline in the pdf.js viewer. Everything else (including HTML)
    // is served as a download with a neutral content type so untrusted markup
    // is never executed as same-origin content.
    if (isPdf) {
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `inline; filename="${safeName}"`)
        .header("X-Content-Type-Options", "nosniff")
        .header("Cache-Control", "private, max-age=300")
        .send(bytes);
    }
    return reply
      .header("Content-Type", "application/octet-stream")
      .header("Content-Disposition", `attachment; filename="${safeName}"`)
      .header("X-Content-Type-Options", "nosniff")
      .header("Cache-Control", "private, max-age=300")
      .send(bytes);
  });

  app.get<{ Params: { id: string } }>("/api/documents/:id/parse", async (request) => {
    return getDocumentParse(assertUuid(request.params.id));
  });

  app.get<{ Params: { id: string } }>("/api/documents/:id/history", async (request) => {
    return getDocumentHistory(assertUuid(request.params.id));
  });

  app.post<{ Params: { id: string } }>("/api/documents/:id/process", async (request, reply) => {
    const id = assertUuid(request.params.id);
    const body = processRequest.parse(request.body ?? {});
    await enqueueProcessing(id, body);
    const detail = await getDocumentDetail(id);
    if (!detail.latestAttempt) throw notFound("No processing attempt found.");
    return reply.status(202).send({
      document: detail.summary,
      attempt: detail.latestAttempt,
      pollHintMs: 1000,
    });
  });

  app.get<{ Params: { id: string } }>("/api/documents/:id/extraction", async (request) => {
    return getExtractionDetail(assertUuid(request.params.id));
  });

  app.patch<{ Params: { id: string } }>("/api/documents/:id/extraction", async (request) => {
    const id = assertUuid(request.params.id);
    const body = saveExtractionRequest.parse(request.body);
    return saveExtraction(id, body);
  });

  app.post<{ Params: { id: string } }>("/api/documents/:id/approve", async (request) => {
    const id = assertUuid(request.params.id);
    const body = approveRequest.parse(request.body);
    return approveDocument(id, body);
  });
}
