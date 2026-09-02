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
