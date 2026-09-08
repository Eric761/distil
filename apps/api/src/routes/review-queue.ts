import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ReviewQueueResponse } from "@invoice/contracts";
import { getReviewQueue } from "../services/review-queue.js";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function reviewQueueRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/review-queue", async (request) => {
    const { limit } = querySchema.parse(request.query ?? {});
    const response: ReviewQueueResponse = await getReviewQueue(limit);
    return response;
  });
}
