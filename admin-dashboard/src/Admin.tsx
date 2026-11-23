// @ts-nocheck
import * as React from "https://esm.sh/react@19.3.0";
import { errorMessage, request } from "./api.js";

const SESSION_KEY = "asksight.dashboard.adminSession";

type AdminSession = {
  email: string;
  accessToken: string;
  refreshToken: string;
};

type UsageUser = {
  id: string;
  name: string;
  email: string;
  joined_at: string;
  images: number;
  questions: number;
  storage_bytes: number;
  last_question_at: string | null;
};

type ModelUsage = {
  model_version: string;
  questions: number;
};

type RecentQuestion = {
  id: string;
  user_name: string;
  user_email: string;
  question: string;
  answer: string;
  model_version: string;
  created_at: string;
};

type Overview = {
  totals: {
    users: number;
    images: number;
    questions: number;
    storage_bytes: number;
  };
  users: UsageUser[];
  models: ModelUsage[];
  recent_questions: RecentQuestion[];
};

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function timeAgo(value: string | null): string {
  if (!value) return "—";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "—";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]).join("").toUpperCase() || "?";
}

const STAT_ICONS: Record<string, React.ReactNode> = {
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.6-3 2.7-4.6 5.5-4.6s4.9 1.6 5.5 4.6" />
      <path d="M16 5.2a3 3 0 0 1 0 5.6" />
      <path d="M17.5 14.6c2 .5 3.2 1.9 3.6 4.4" />
    </>
  ),
  images: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4.5 17 5-5 3.5 3.5 2.5-2.5 4 4" />
    </>
  ),
  questions: (
    <>
      <path d="M4 5.5h16v10H9l-4.5 3.5v-13.5Z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </>
  ),
  storage: (
    <>
      <ellipse cx="12" cy="6" rx="7.5" ry="3" />
      <path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6" />
      <path d="M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6" />
    </>
  ),
};

function StatIcon({ name }: { name: string }) {
  return (
    <svg
      className="a11s-stat-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {STAT_ICONS[name]}
    </svg>
  );
}

function storedSession(): AdminSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.email && parsed?.accessToken && parsed?.refreshToken
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function persistSession(next: AdminSession): AdminSession {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  return next;
}

function statusError(result: { status: number; error: string }) {
  const error: any = new Error(result.error);
  error.status = result.status;
  return error;
}

async function signIn(email: string, password: string): Promise<AdminSession> {
  const result = await request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!result.ok) throw statusError(result);
  return {
    email,
    accessToken: result.body.access_token,
    refreshToken: result.body.refresh_token,
  };
}

async function refresh(current: AdminSession): Promise<AdminSession> {
  const result = await request("/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: current.refreshToken }),
  });
  if (!result.ok) throw statusError(result);
  return persistSession({
    ...current,
    accessToken: result.body.access_token,
    refreshToken: result.body.refresh_token,
  });
}

async function fetchOverview(
  active: AdminSession,
): Promise<{ data: Overview; session: AdminSession }> {
  const path = "/admin/overview?recent=25";
  let current = active;
  let result = await request(path, {}, current.accessToken);
  if (result.status === 401) {
    current = await refresh(active);
    result = await request(path, {}, current.accessToken);
  }
  if (!result.ok) throw statusError(result);
  return { data: result.body, session: current };
}

export default function Admin() {
  const [session, setSession] = React.useState<AdminSession | null>(storedSession);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [data, setData] = React.useState<Overview | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const load = React.useCallback(async (active: AdminSession) => {
    setLoading(true);
    setError("");
    try {
      const next = await fetchOverview(active);
      setSession(next.session);
      setData(next.data);
    } catch (cause) {
      if ((cause as any).status === 401) {
        window.localStorage.removeItem(SESSION_KEY);
        setSession(null);
        setData(null);
        setError("Session expired. Sign in again.");
      } else {
        setError(errorMessage(cause));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    // Reload with the session from the last visit; the form signs in for new ones.
    if (session) load(session);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!address || !password) {
      setError("Enter your email and password.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const next = persistSession(await signIn(address, password));
      setSession(next);
      setPassword("");
      await load(next);
    } catch (cause) {
      setError(errorMessage(cause));
      setLoading(false);
    }
  }

  function signOut() {
    window.localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setData(null);
    setError("");
    setPassword("");
  }

  if (!session) {
    return (
      <form className="a11s-card a11s-admin-gate" onSubmit={submit}>
        <h2>Admin sign in</h2>
        <p className="a11s-muted">
          This view shows every user's activity, so it needs the admin account.
        </p>
        {error ? (
          <p className="a11s-error" role="alert">
            {error}
          </p>
        ) : null}
        <label htmlFor="admin-email" className="a11s-label">
          Email
        </label>
        <input
          id="admin-email"
          type="email"
          className="a11s-input a11s-input-single"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="username"
        />
        <label htmlFor="admin-password" className="a11s-label">
          Password
        </label>
        <input
          id="admin-password"
          type="password"
          className="a11s-input a11s-input-single"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
        />
        <button
          className="a11s-button"
          type="submit"
          disabled={loading || !email.trim() || !password}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    );
  }

  return (
    <section>
      <div className="a11s-admin-bar">
        <span className="a11s-pill">
          <span className="a11s-dot" aria-hidden="true" />
          Admin view
        </span>
        <div className="a11s-actions">
          <button
            className="a11s-button a11s-button-ghost"
            onClick={() => load(session)}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button className="a11s-button a11s-button-ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>

      {error ? (
        <p className="a11s-error a11s-banner" role="alert">
          {error}
        </p>
      ) : null}

      {!data ? (
        <p className="a11s-muted">Loading usage…</p>
      ) : (
        <>
          <div className="a11s-stats">
            <div className="a11s-stat">
              <span className="a11s-stat-label">Users</span>
              <div className="a11s-stat-value">{data.totals.users}</div>
            </div>
            <div className="a11s-stat">
              <span className="a11s-stat-label">Images</span>
              <div className="a11s-stat-value">{data.totals.images}</div>
            </div>
            <div className="a11s-stat">
              <span className="a11s-stat-label">Questions</span>
              <div className="a11s-stat-value">{data.totals.questions}</div>
            </div>
            <div className="a11s-stat">
              <span className="a11s-stat-label">Storage</span>
              <div className="a11s-stat-value">
                {formatBytes(data.totals.storage_bytes)}
              </div>
            </div>
          </div>

          <div className="a11s-admin-grid">
            <section className="a11s-card">
              <h2>Usage by user</h2>
              <div className="a11s-table-wrap">
                <table className="a11s-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Images</th>
                      <th>Questions</th>
                      <th>Storage</th>
                      <th>Last question</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map((user) => (
                      <tr key={user.id}>
                        <td>
                          <strong>{user.name}</strong>
                          <br />
                          <span className="a11s-muted">{user.email}</span>
                        </td>
                        <td>{user.images}</td>
                        <td>{user.questions}</td>
                        <td>{formatBytes(user.storage_bytes)}</td>
                        <td>{formatDate(user.last_question_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.users.length ? (
                  <p className="a11s-empty">No users yet.</p>
                ) : null}
              </div>
            </section>

            <section className="a11s-card">
              <h2>Model versions</h2>
              {data.models.length ? (
                <ul className="a11s-model-list">
                  {data.models.map((model) => (
                    <li key={model.model_version}>
                      <span>{model.model_version}</span>
                      <strong>{model.questions}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="a11s-empty">No answers yet.</p>
              )}
            </section>
          </div>

          <section className="a11s-card">
            <h2>Recent questions &amp; answers</h2>
            <div className="a11s-table-wrap">
              <table className="a11s-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>User</th>
                    <th>Question</th>
                    <th>Answer</th>
                    <th>Model</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_questions.map((entry) => (
                    <tr key={entry.id}>
                      <td className="a11s-nowrap">
                        {formatDate(entry.created_at)}
                      </td>
                      <td>
                        <strong>{entry.user_name}</strong>
                        <br />
                        <span className="a11s-muted">{entry.user_email}</span>
                      </td>
                      <td>{entry.question}</td>
                      <td className="a11s-answer-cell">{entry.answer}</td>
                      <td className="a11s-nowrap">{entry.model_version}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.recent_questions.length ? (
                <p className="a11s-empty">No questions yet.</p>
              ) : null}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
