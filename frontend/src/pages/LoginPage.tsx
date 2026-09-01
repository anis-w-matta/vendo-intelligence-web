import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AuthError } from "../lib/auth";

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(loginId, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof AuthError ? err.message : "Could not sign in. Is the backend running?");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="card login-card">
        <h1>VeNdO Intelligence</h1>
        <p className="sub">Admin-only analytics. Sign in with your VeNdO admin account.</p>
        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="login-id">Login ID</label>
            <input
              id="login-id"
              type="text"
              autoComplete="username"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              required
            />
          </div>
          <div className="login-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <div className="banner banner-error" role="alert" style={{ marginBottom: 14 }}>
              {error}
            </div>
          )}
          <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
