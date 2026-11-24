// @ts-nocheck
import * as React from "https://esm.sh/react@19.3.0";
import { errorMessage, request } from "./api.js";

const SESSION_KEY = "asksight.dashboard.session";

export type AdminSession = {
  email: string;
  accessToken: string;
  refreshToken: string;
};

export function readSession(): AdminSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    return value?.email && value?.accessToken && value?.refreshToken ? value : null;
  } catch {
    return null;
  }
}

export function saveSession(session: AdminSession): void {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  window.localStorage.removeItem(SESSION_KEY);
}

export async function refreshSession(current: AdminSession): Promise<AdminSession> {
  const result = await request("/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: current.refreshToken }),
  });
  if (!result.ok) {
    clearSession();
    const error: any = new Error(result.error);
    error.status = result.status;
    throw error;
  }
  const next: AdminSession = {
    ...current,
    accessToken: result.body.access_token,
    refreshToken: result.body.refresh_token,
  };
  saveSession(next);
  return next;
}

export default function Login({ onSignedIn }: { onSignedIn: (session: AdminSession) => void }) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!address || !password) {
      setError("Enter your admin email and password.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const login = await request("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address, password }),
      });
      if (!login.ok) throw new Error(login.error);

      // The password is not stored in the browser; the refresh token is enough
      // to keep the session alive, and a failed refresh sends us back here.
      const check = await request("/admin/overview?recent=1", {}, login.body.access_token);
      if (check.status === 401) {
        // Don't leave a live session behind for an account that cannot use the console.
        await request("/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: login.body.refresh_token }),
        });
        throw new Error("This account does not have admin access.");
      }
      if (!check.ok) throw new Error(check.error);

      const session: AdminSession = {
        email: address.toLowerCase(),
        accessToken: login.body.access_token,
        refreshToken: login.body.refresh_token,
      };
      saveSession(session);
      setBusy(false);
      onSignedIn(session);
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }

  return (
    <main className="a11s-login-shell">
      <section className="a11s-login-card" aria-labelledby="login-heading">
        <div className="a11s-brand">
          <span className="a11s-mark" aria-hidden="true" />
          <div className="a11s-brand-text">
            <strong>AskSight</strong>
            <span>Admin console</span>
          </div>
        </div>

        <h1 id="login-heading">Sign in</h1>
        <p className="a11s-muted">
          Use an account with the <strong>ADMIN</strong> role to open the console.
        </p>

        {error ? (
          <p className="a11s-error" role="alert">
            {error}
          </p>
        ) : null}

        <form onSubmit={submit}>
          <label htmlFor="login-email" className="a11s-label">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            className="a11s-input a11s-input-single"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            autoFocus
          />

          <label htmlFor="login-password" className="a11s-label">
            Password
          </label>
          <input
            id="login-password"
            type="password"
            className="a11s-input a11s-input-single"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />

          <button
            className="a11s-button a11s-login-button"
            type="submit"
            disabled={busy || !email.trim() || !password}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
