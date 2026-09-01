// Thin fetch wrapper for calling the existing backend/catalog-service
// FastAPI services - this is the only place this BFF talks to those
// services (never Postgres directly, see 01_architecture_map.md).

export class UpstreamError extends Error {
  constructor(
    public readonly service: string,
    public readonly status: number | "network",
    message: string,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

export interface HttpClientOptions {
  service: string;
  baseUrl: string;
  apiKey?: string;
  authorization?: string;
}

// `params?: object` (not `Record<string, unknown>`) deliberately - a
// concrete DTO interface like OrdersFilterParams has no index signature,
// so TS's strict mode refuses to pass it where Record<string, unknown> is
// expected even though every access below is a plain Object.entries walk.
// `object` accepts any such interface; the cast just below is where the
// actual (safe, read-only) unknown-shape iteration happens.
function buildUrl(baseUrl: string, path: string, params?: object): URL {
  const url = new URL(path, baseUrl);
  if (params) {
    for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  return url;
}

export async function getJson<T>(
  opts: HttpClientOptions,
  path: string,
  params?: object,
): Promise<T> {
  const url = buildUrl(opts.baseUrl, path, params);
  const headers: Record<string, string> = {};
  if (opts.apiKey) headers["X-Api-Key"] = opts.apiKey;
  if (opts.authorization) headers["Authorization"] = opts.authorization;

  let res: Response;
  try {
    res = await fetch(url, { headers });
  } catch (err) {
    throw new UpstreamError(
      opts.service,
      "network",
      `network error calling ${opts.service} at ${url.pathname}: ${(err as Error).message}`,
    );
  }
  if (!res.ok) {
    throw new UpstreamError(
      opts.service,
      res.status,
      `${opts.service} ${url.pathname} responded ${res.status}`,
    );
  }
  return (await res.json()) as T;
}
