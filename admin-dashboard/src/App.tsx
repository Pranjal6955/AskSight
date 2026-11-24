// @ts-nocheck
import * as React from "https://esm.sh/react@19.3.0";
import Admin from "./Admin.js";
import Login, {
  AdminSession,
  clearSession,
  readSession,
  refreshSession,
} from "./Login.js";
import Metrics from "./Metrics.js";
import { errorMessage, request } from "./api.js";

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

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// The test console's upload/ask helpers are plain functions, so keep the
// current token here as well as in React state.
let session: AdminSession | null = readSession();
let onUnauthorized: () => void = () => {};

async function api(path: string, init: RequestInit = {}) {
  if (!session) throw new Error("Sign in to use the console.");

  let result = await request(path, init, session.accessToken);
  if (result.status === 401) {
    try {
      session = await refreshSession(session);
    } catch (cause) {
      onUnauthorized();
      throw cause;
    }
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

function MetricsIcon() {
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
      <path d="M3 20h18" />
      <path d="M6 20v-6" />
      <path d="M11 20V7" />
      <path d="M16 20v-9" />
      <path d="M21 20V4" />
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
  const [activeSession, setActiveSession] = React.useState<AdminSession | null>(
    () => readSession(),
  );
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
  const [view, setView] = React.useState<"test" | "usage" | "metrics">("test");

  React.useEffect(() => {
    onUnauthorized = () => {
      clearSession();
      setActiveSession(null);
    };
    return () => {
      onUnauthorized = () => {};
    };
  }, []);

  function signedIn(next: AdminSession) {
    session = next;
    setActiveSession(next);
  }

  async function signOut() {
    if (session) {
      try {
        await request("/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: session.refreshToken }),
        });
      } catch {
        // Losing the network must not trap the user in the console.
      }
    }
    clearSession();
    session = null;
    setActiveSession(null);
    setState({
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
  }

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

  if (!activeSession) return <Login onSignedIn={signedIn} />;

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
          <button
            className="a11s-nav-item"
            aria-current={view === "metrics" ? "page" : undefined}
            onClick={() => setView("metrics")}
          >
            <MetricsIcon />
            <span>Metrics</span>
          </button>
        </nav>

        <div className="a11s-sidebar-foot">
          <span className="a11s-status-pill is-live">
            <span className="a11s-dot" aria-hidden="true" />
            Backend connected
          </span>
          <span className="a11s-account" title={activeSession.email}>
            {activeSession.email}
          </span>
          <button className="a11s-button a11s-button-ghost" onClick={signOut}>
            Sign out
          </button>
          <span className="a11s-version">Model ops · local</span>
        </div>
      </aside>

      <section className="a11s-main">
        <header className="a11s-topbar">
          <div>
            <p className="a11s-eyebrow">
              {view === "test" ? "Workspace" : "Analytics"}
            </p>
            <h1>
              {view === "test"
                ? "Test console"
                : view === "metrics"
                  ? "Metrics"
                  : "Usage"}
            </h1>
            <p className="a11s-muted">
              {view === "test"
                ? "Upload a photo, ask a question, read the text answer."
                : view === "metrics"
                  ? "Grafana charts backed by Prometheus scraping /metrics."
                  : "Users, images, questions, and the latest answers."}
            </p>
          </div>
          {view === "test" ? (
            <span className="a11s-pill">
              <span className="a11s-dot" aria-hidden="true" />
              Live
            </span>
          ) : null}
        </header>

        <div className="a11s-content">
          {view === "metrics" ? (
            <Metrics />
          ) : view === "usage" ? (
            <Admin
              session={activeSession}
              onSession={signedIn}
              onUnauthorized={onUnauthorized}
            />
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
                    {state.file ? state.file.name : "JPEG or PNG, up to 10 MB."}
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
                    <span className="a11s-hint">
                      Enter to ask · Shift+Enter for a new line
                    </span>
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
