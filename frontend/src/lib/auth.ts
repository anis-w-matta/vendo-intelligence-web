// Login goes straight to the existing backend's POST /auth/login (the BFF
// has no auth route of its own - see docs/audit/04_auth_map.md). The
// resulting JWT is then sent as the Authorization header on every BFF
// call; the BFF re-verifies it itself against backend on every request
// ("the UI alone must never determine authorization" - it never trusts a
// role claim decoded client-side).
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://127.0.0.1:8000";
const STORAGE_KEY = "vendo_intelligence_session";

export interface Session {
  token: string;
  loginId: string;
  name: string;
  role: string;
}

export class AuthError extends Error {}

export async function login(loginId: string, password: string): Promise<Session> {
  const res = await fetch(`${BACKEND_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login_id: loginId, password }),
  });
  if (!res.ok) {
    throw new AuthError(res.status === 401 ? "Invalid login ID or password." : `Login failed (${res.status}).`);
  }
  const body = await res.json();
  if (body.role !== "admin") {
    throw new AuthError("VeNdO Intelligence is admin-only. This account does not have admin access.");
  }
  const session: Session = { token: body.token, loginId: body.login_id, name: body.name, role: body.role };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function loadSession(): Session | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
