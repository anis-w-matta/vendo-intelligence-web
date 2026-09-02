// This BFF has never actually auto-loaded backend/.env - config below
// reads process.env directly, and every var except GEMINI_API_KEY has a
// fallback default that happens to match .env.example's own documented
// values, so the gap was invisible until Phase 14 added a var with no
// sensible default (a secret). Found live: GEMINI_API_KEY was correctly
// present in .env, yet the running BFF reported it as unconfigured.
// Node 20.6+ can load a .env file itself - no `dotenv` package needed,
// consistent with this BFF's existing minimal-dependency convention.
// Optional by design (silently continues if .env doesn't exist, e.g. in
// a deployment that sets real env vars directly) via the `if (...)` guard
// rather than the throwing loadEnvFile() default.
if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file - fine, every var below has either a fallback default
    // or (GEMINI_API_KEY) its own documented optional/graceful-degrade path.
  }
}

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    throw new Error(`missing required env var ${name}`);
  }
  return v;
}

export const config = {
  backendUrl: env("BACKEND_URL", "http://127.0.0.1:8000"),
  catalogUrl: env("CATALOG_URL", "http://127.0.0.1:8100"),
  backendApiKey: process.env.BACKEND_API_KEY || undefined,
  catalogApiKey: process.env.CATALOG_API_KEY || undefined,
  // Phase 14 (Gemini Intelligence Layer) - optional. Unset is a real,
  // expected dev/test state (never required for this BFF to run) -
  // geminiClient.ts degrades every call to a typed "unavailable" result
  // rather than throwing when this is missing. See backend/.env.example.
  geminiApiKey: process.env.GEMINI_API_KEY || undefined,
  port: Number(env("PORT", "8200")),
};
