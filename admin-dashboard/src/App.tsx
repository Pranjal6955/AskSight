// @ts-nocheck
import * as React from "https://esm.sh/react@19.3.0";
import Admin from "./Admin.js";
import { errorMessage, request } from "./api.js";

type Session = {
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
};

type State = {
  file: File | null;
  preview: string;
  imageId: string;
  question: string;
  answer: string;
  model: string;
  error: string;
  status: string;
  uploadLoading: boolean;
  askLoading: boolean;
};

const SESSION_KEY = "asksight.dashboard.session";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

let session: Session | null = null;

function storedSession(): Session | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.accessToken && parsed?.refreshToken && parsed?.email
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function persist(next: Session): Session {
  session = next;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  return next;
}

async function signIn(email: string, password: string) {
  const result = await request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!result.ok) throw new Error(result.error);
  return result.body;
}

async function refreshSession(current: Session): Promise<Session> {
  const result = await request("/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: current.refreshToken }),
  });

  if (result.ok) {
    return persist({
      ...current,
      accessToken: result.body.access_token,
      refreshToken: result.body.refresh_token,
    });
  }

  // The refresh token was rotated or revoked; the stored credentials recover it.
  const tokens = await signIn(current.email, current.password);
  return persist({
    ...current,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
  });
}

function randomId(): string {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

async function ensureSession(): Promise<Session> {
  const current = storedSession();
  if (current) {
    try {
      return await refreshSession(current);
    } catch (cause) {
      // A network failure will fail signup too; surface it instead of guessing.
      if (errorMessage(cause).startsWith("Cannot reach")) throw cause;
    }
  }

  // No login screen: this browser gets its own throwaway account once.
  const id = randomId().replace(/-/g, "").slice(0, 12);
  const email = `dashboard.${id}@example.com`;
  const password = randomId();

  const signup = await request("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Dashboard", email, password }),
  });
  if (!signup.ok && signup.status !== 409) throw new Error(signup.error);

  const tokens = await signIn(email, password);
  return persist({
    email,
    password,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
  });
}

async function api(path: string, init: RequestInit = {}) {
  if (!session) throw new Error("The dashboard is not connected to the backend.");

  let result = await request(path, init, session.accessToken);
  if (result.status === 401) {
    session = await refreshSession(session);
    result = await request(path, init, session.accessToken);
  }
  if (!result.ok) {
    const error: any = new Error(result.error);
    error.status = result.status;
    error.body = result.body;
    throw error;
  }
  return result.body;
}

function TestIcon() {
  return (
    <svg
      className="a11s-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 8V6a2 2 0 0 1 2-2h2" />
      <path d="M16 4h2a2 2 0 0 1 2 2v2" />
      <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
      <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
      <circle cx="12" cy="12" r="3.4" />
    </svg>
  );
}

function UsageIcon() {
  return (
    <svg
      className="a11s-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M22 20H2" />
    </svg>
  );
}

export default function Dashboard() {
  const [connected, setConnected] = React.useState(false);
  const [connecting, setConnecting] = React.useState(true);
  const [connectionError, setConnectionError] = React.useState("");
  const [state, setState] = React.useState<State>({
    file: null,
    preview: "",
    imageId: "",
    question: "",
    answer: "",
    model: "",
    error: "",
    status: "",
    uploadLoading: false,
    askLoading: false,
  });
  const [view, setView] = React.useState<"test" | "usage">("test");

  const connect = React.useCallback(() => {
    setConnecting(true);
    setConnectionError("");
    ensureSession()
      .then(() => {
        setConnected(true);
        setConnecting(false);
      })
      .catch((cause) => {
        setConnectionError(errorMessage(cause));
        setConnecting(false);
      });
  }, []);

  React.useEffect(() => {
    connect();
  }, [connect]);

  async function uploadPhoto() {
    if (!state.file) return;
    if (state.file.size > MAX_IMAGE_BYTES) {
      setState((s) => ({
        ...s,
        error: "That image is larger than 10 MB. Choose a smaller one.",
      }));
      return;
    }

    setState((s) => ({ ...s, error: "", status: "", uploadLoading: true }));
    try {
      const form = new FormData();
      form.append("file", state.file);
      const image = await api("/images", { method: "POST", body: form });
      setState((s) => ({
        ...s,
        imageId: image.id,
        answer: "",
        model: "",
        status: "Photo uploaded. Ask a question about it.",
        uploadLoading: false,
      }));
    } catch (cause) {
      setState((s) => ({
        ...s,
        uploadLoading: false,
        error: errorMessage(cause),
      }));
    }
  }

  async function ask() {
    const cleaned = state.question.trim();
    if (!state.imageId) {
      setState((s) => ({ ...s, error: "Upload a photo first." }));
      return;
    }
    if (!cleaned) {
      setState((s) => ({ ...s, error: "Type a question first." }));
      return;
    }

    setState((s) => ({ ...s, error: "", status: "", askLoading: true }));
    try {
      const body = await api("/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_id: state.imageId, question: cleaned }),
      });
      setState((s) => ({
        ...s,
        answer: body.answer,
        model: body.model_version,
        askLoading: false,
        status: "Answer ready.",
      }));
    } catch (cause: any) {
      const savedAnswer = cause?.body?.answer;
      setState((s) => ({
        ...s,
        askLoading: false,
        answer: savedAnswer || s.answer,
        model: cause?.body?.model_version || s.model,
        error: savedAnswer
          ? `${errorMessage(cause)} The answer below was not saved to history.`
          : errorMessage(cause),
      }));
    }
  }

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setState((s) => {
      if (s.preview) URL.revokeObjectURL(s.preview);
      return {
        ...s,
        file,
        preview: file ? URL.createObjectURL(file) : "",
        imageId: "",
        answer: "",
        model: "",
        error: "",
        status: "",
      };
    });
  }

  return (
    <div className="a11s-shell">
      <aside className="a11s-sidebar">
        <div className="a11s-brand">
          <span className="a11s-mark" aria-hidden="true" />
          <div className="a11s-brand-text">
            <strong>AskSight</strong>
            <span>Admin console</span>
          </div>
        </div>

        <nav className="a11s-nav" aria-label="Dashboard views">
          <span className="a11s-nav-label">Workspace</span>
          <button
            className="a11s-nav-item"
            aria-current={view === "test" ? "page" : undefined}
            onClick={() => setView("test")}
          >
            <TestIcon />
            <span>Test console</span>
          </button>
          <button
            className="a11s-nav-item"
            aria-current={view === "usage" ? "page" : undefined}
            onClick={() => setView("usage")}
          >
            <UsageIcon />
            <span>Usage</span>
          </button>
        </nav>

        <div className="a11s-sidebar-foot">
          <span className={`a11s-status-pill ${connected ? "is-live" : ""}`}>
            <span className="a11s-dot" aria-hidden="true" />
            {connected
              ? "Backend connected"
              : connecting
                ? "Connecting…"
                : "Backend offline"}
          </span>
          <span className="a11s-version">Model ops · local</span>
        </div>
      </aside>

      <section className="a11s-main">
        <header className="a11s-topbar">
          <div>
            <p className="a11s-eyebrow">
              {view === "test" ? "Workspace" : "Analytics"}
            </p>
            <h1>{view === "test" ? "Test console" : "Usage"}</h1>
            <p className="a11s-muted">
              {view === "test"
                ? "Upload a photo, ask a question, read the text answer."
                : "Users, images, questions, and the latest answers."}
            </p>
          </div>
          {view === "test" && connected ? (
            <span className="a11s-pill">
              <span className="a11s-dot" aria-hidden="true" />
              Live
            </span>
          ) : null}
        </header>

        <div className="a11s-content">
      {view === "usage" ? (
        <Admin />
      ) : !connected ? (
        <section className="a11s-card a11s-connect">
          {connecting ? (
            <p className="a11s-muted" role="status">
              Connecting to the backend…
            </p>
          ) : (
            <>
              <p className="a11s-error" role="alert">
                {connectionError}
              </p>
              <button className="a11s-button" onClick={connect}>
                Retry connection
              </button>
            </>
          )}
        </section>
      ) : (
        <>
      {state.error ? (
        <p className="a11s-error a11s-banner" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="a11s-grid">
        <section className="a11s-card" aria-labelledby="photo-heading">
          <span className="a11s-card-kicker">Step 1</span>
          <h2 id="photo-heading">Photo</h2>

          <div className="a11s-photo">
            {state.preview ? (
              <img
                src={state.preview}
                alt="Selected photo"
                className="a11s-photo-preview"
              />
            ) : (
              <div className="a11s-empty-photo">
                <span>Choose a photo to test the model.</span>
              </div>
            )}
          </div>

          <div className="a11s-file-row">
            <input
              id="photo-input"
              type="file"
              accept="image/*"
              onChange={onFile}
              className="a11s-file-input"
            />
            <label htmlFor="photo-input" className="a11s-file">
              Choose photo
            </label>
            <button
              className="a11s-button"
              onClick={uploadPhoto}
              disabled={!state.file || state.uploadLoading}
            >
              {state.uploadLoading ? "Uploading…" : "Upload"}
            </button>
          </div>
          <p className="a11s-hint">
            {state.file
              ? state.file.name
              : "JPEG or PNG, up to 10 MB."}
          </p>

          {state.imageId ? (
            <p className="a11s-ok">
              <span className="a11s-check" aria-hidden="true">
                ✓
              </span>
              Photo uploaded
            </p>
          ) : null}
        </section>

        <section className="a11s-card" aria-labelledby="question-heading">
          <span className="a11s-card-kicker">Step 2</span>
          <h2 id="question-heading">Question</h2>
          <label htmlFor="question-input" className="a11s-label">
            Ask about the photo (text only)
          </label>
          <textarea
            id="question-input"
            className="a11s-input"
            value={state.question}
            placeholder="What do you see?"
            rows={3}
            onChange={(event) =>
              setState((s) => ({ ...s, question: event.target.value }))
            }
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                state.imageId &&
                state.question.trim() &&
                !state.askLoading
              ) {
                event.preventDefault();
                ask();
              }
            }}
          />
          <div className="a11s-actions">
            <button
              className="a11s-button"
              onClick={ask}
              disabled={
                !state.imageId || !state.question.trim() || state.askLoading
              }
            >
              {state.askLoading ? "Asking…" : "Ask"}
            </button>
            <span className="a11s-hint">Enter to ask · Shift+Enter for a new line</span>
          </div>

          <h2 className="a11s-answer-heading">Answer</h2>
          {state.answer ? (
            <div className="a11s-answer">
              <p>{state.answer}</p>
              {state.model ? (
                <p className="a11s-meta">Model: {state.model}</p>
              ) : null}
            </div>
          ) : (
            <div className="a11s-answer a11s-answer-empty">
              The model's answer will appear here.
            </div>
          )}
        </section>
      </div>

      <p className="a11s-status" role="status" aria-live="polite">
        {state.status}
      </p>
        </>
      )}
        </div>
      </section>
    </div>
  );
}
