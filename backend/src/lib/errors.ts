import type { FastifyReply } from "fastify";
import { UpstreamError } from "./httpClient.js";

// Shared upstream-failure handling for every route (phase 10's "FastAPI
// unavailable / catalog-service unavailable / timeouts" requirement) -
// never crash the process, never claim success with fabricated data.
export function handleUpstreamError(err: unknown, reply: FastifyReply): void {
  if (err instanceof UpstreamError) {
    if (err.status === 404) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    reply.code(503).send({
      error: `upstream service unavailable: ${err.service}`,
      detail: err.message,
    });
    return;
  }
  throw err;
}
