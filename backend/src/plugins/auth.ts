// "The UI alone must never determine authorization" (00_master_prompt.md).
// This BFF verifies admin identity itself, on every request, by
// delegating to backend's existing GET /auth/me - no shared JWT secret
// between the two codebases, and it reuses backend's own JWT
// verification instead of duplicating it (see docs/audit/04_auth_map.md).
import type { FastifyReply, FastifyRequest } from "fastify";
import { getAuthMe } from "../lib/backendClient.js";
import { UpstreamError } from "../lib/httpClient.js";

interface CacheEntry {
  loginId: string;
  role: string;
  expiresAt: number;
}

// Short-lived (a few seconds) so a burst of requests from one page load
// doesn't each re-hit backend, without caching an admin's identity for
// long enough to matter if their session is revoked mid-session.
const CACHE_TTL_MS = 5_000;
const cache = new Map<string, CacheEntry>();

function pruneExpired(now: number) {
  for (const [token, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(token);
  }
}

declare module "fastify" {
  interface FastifyRequest {
    admin?: { loginId: string };
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authorization = request.headers.authorization;
  if (!authorization) {
    reply.code(401).send({ error: "missing bearer token" });
    return;
  }

  const now = Date.now();
  const cached = cache.get(authorization);
  if (cached && cached.expiresAt > now) {
    if (cached.role !== "admin") {
      reply.code(403).send({ error: "admin access required" });
      return;
    }
    request.admin = { loginId: cached.loginId };
    return;
  }

  try {
    const me = await getAuthMe(authorization);
    if (cache.size > 1000) pruneExpired(now);
    cache.set(authorization, { loginId: me.login_id, role: me.role, expiresAt: now + CACHE_TTL_MS });
    if (!me.is_active || me.role !== "admin") {
      reply.code(403).send({ error: "admin access required" });
      return;
    }
    request.admin = { loginId: me.login_id };
  } catch (err) {
    if (err instanceof UpstreamError && err.status !== "network") {
      // backend itself rejected the token (401) or errored - either way,
      // this caller is not a verified admin.
      reply.code(401).send({ error: "invalid or expired token" });
      return;
    }
    // backend unreachable - fail closed, not open. "The UI alone must
    // never determine authorization" means an auth check we can't
    // perform must refuse, not silently let the request through.
    reply.code(503).send({ error: "could not verify identity - auth service unavailable" });
  }
}
