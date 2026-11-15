import {
  clearRefreshToken,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "./session";

const BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:8000"
).replace(/\/$/, "");

export type User = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
};

export type ImageInfo = {
  id: string;
  mime_type: string;
  size_bytes: number;
  width: number;
  height: number;
  created_at: string;
};

export type AskResponse = {
  entry_id: string;
  answer: string;
  model_version: string;
  created_at: string;
};

export type Transcript = {
  transcript: string;
  language: string | null;
};

export type HistoryItem = {
  id: string;
  question: string;
  answer: string;
  image_id: string;
  image_url: string;
  model_version: string;
  created_at: string;
};

export type HistoryPage = {
  items: HistoryItem[];
  next_cursor: string | null;
  has_more: boolean;
};

export type UploadFile = {
  uri: string;
  name: string;
  type: string;
};

type BinaryBody = {
  bytes: ArrayBuffer;
  mimeType: string;
};

type ValidationIssue = {
  loc?: (string | number)[];
  msg?: string;
};

type JsonInit = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

export class ApiError extends Error {
  status: number;
  requestId: string | null;

  constructor(message: string, status: number, requestId: string | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.requestId = requestId;
  }
}

let sessionExpiredHandler: ((message: string) => void) | null = null;
let refreshing: Promise<string> | null = null;

export function setSessionExpiredHandler(
  handler: ((message: string) => void) | null,
) {
  sessionExpiredHandler = handler;
}

async function send(
  path: string,
  init: JsonInit,
  token?: string,
): Promise<Response> {
  const headers: Record<string, string> = { ...init.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  // fetch sets the multipart boundary itself; a manual Content-Type breaks it.
  const isForm =
    typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body && !isForm && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  return fetch(`${BASE_URL}${path}`, { ...init, headers });
}

async function sendOk(
  path: string,
  init: JsonInit,
  token?: string,
): Promise<Response> {
  const res = await send(path, init, token);
  if (!res.ok) {
    throw new ApiError(
      await readError(res),
      res.status,
      res.headers.get("X-Request-ID"),
    );
  }
  return res;
}

async function parseJson<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function request<T>(
  path: string,
  init: JsonInit = {},
  token?: string,
): Promise<T> {
  return parseJson<T>(await sendOk(path, init, token));
}

async function requestVoid(path: string, init: JsonInit = {}): Promise<void> {
  await request<void>(path, init);
}

// The backend returns `detail` as a human sentence on 401/409 but as an array
// of technical validation issues on 422. Everything the user sees is a
// complete plain-language sentence — no status codes or field paths.
function friendlyValidation(issue: ValidationIssue | null): string {
  const field = issue?.loc?.[issue.loc.length - 1];
  const msg = issue?.msg ?? "";
  if (field === "email" || /email/i.test(msg)) {
    return "Please enter a valid email address.";
  }
  if (field === "password" || /password/i.test(msg)) {
    return "Please pick a password with at least 8 characters.";
  }
  if (field === "name" || /name/i.test(msg)) {
    return "Please enter your name.";
  }
  if (field === "question") {
    return "Please enter a question of 500 characters or fewer.";
  }
  if (field === "text") {
    return "There is no text to read aloud.";
  }
  if (field === "image_id") {
    return "Please choose a photo first.";
  }
  if (field === "file") {
    return "Please choose a file.";
  }
  if (field === "refresh_token") {
    return "Your session has expired. Please sign in again.";
  }
  return "Please check the information you entered and try again.";
}

export async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const detail = body?.detail;

    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const messages = Array.from(
        new Set(
          detail.map((issue: ValidationIssue | null) =>
            friendlyValidation(issue),
          ),
        ),
      );
      if (messages.length > 0) return messages.join(" ");
    }
  } catch {
    // non-JSON error body
  }
  if (res.status === 401) {
    return "Your session has expired. Please sign in again.";
  }
  if (res.status === 409) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (res.status === 413) {
    return "That file is too large. Please choose a smaller one.";
  }
  if (res.status === 415) {
    return "That file type is not supported. Please choose a different file.";
  }
  if (res.status === 422) {
    return "Please check the information you entered and try again.";
  }
  if (res.status === 503) {
    return "The model is unavailable right now. Please try again later.";
  }
  if (res.status === 429) {
    return "Too many requests. Please wait a moment and try again.";
  }
  if (res.status === 504) {
    return "The model took too long to answer. Please try again.";
  }
  if (res.status >= 500) {
    return "AskSight is having trouble right now. Please try again in a moment.";
  }
  return "We couldn't complete that request. Please try again.";
}

// fetch() rejects with a bare TypeError on connection failure; anything else
// bubbles up as an Error whose message is already user-facing. Replace only
// the technical cases so the form never shows "Network request failed".
export function toFriendlyMessage(cause: unknown, fallback: string): string {
  if (!(cause instanceof Error) || !cause.message) return fallback;
  if (
    /network request failed|failed to fetch|network error/i.test(cause.message)
  ) {
    return "We couldn't connect to AskSight. Check your internet connection and try again.";
  }
  return cause.message;
}

function expireSession(message: string) {
  setAccessToken(null);
  void clearRefreshToken();
  sessionExpiredHandler?.(message);
}

async function refreshAccessToken(staleToken?: string): Promise<string> {
  // Another request may already have refreshed while this one was in flight.
  const current = getAccessToken();
  if (staleToken && current && current !== staleToken) return current;
  if (refreshing) return refreshing;

  refreshing = (async () => {
    const token = await getRefreshToken();
    if (!token) {
      throw new ApiError(
        "Your session has expired. Please sign in again.",
        401,
        null,
      );
    }
    const tokens = await refresh(token);
    setAccessToken(tokens.access_token);
    try {
      await setRefreshToken(tokens.refresh_token);
    } catch {
      // The rotated token could not be persisted; this session still works,
      // and the next cold start will simply ask the user to sign in again.
    }
    return tokens.access_token;
  })().finally(() => {
    refreshing = null;
  });

  return refreshing;
}

function handleRefreshFailure(cause: unknown): never {
  if (
    cause instanceof ApiError &&
    (cause.status === 401 || cause.status === 422)
  ) {
    expireSession(cause.message);
  }
  throw cause;
}

async function authorized<T>(
  path: string,
  init: JsonInit,
  parse: (res: Response) => Promise<T>,
): Promise<T> {
  let usedToken = getAccessToken();
  try {
    usedToken = usedToken ?? (await refreshAccessToken());
    return parse(await sendOk(path, init, usedToken));
  } catch (cause) {
    if (!(cause instanceof ApiError) || cause.status !== 401) throw cause;

    let fresh: string;
    try {
      fresh = await refreshAccessToken(usedToken ?? undefined);
    } catch (refreshCause) {
      return handleRefreshFailure(refreshCause);
    }

    try {
      return parse(await sendOk(path, init, fresh));
    } catch (retryCause) {
      if (retryCause instanceof ApiError && retryCause.status === 401) {
        expireSession("Your session has expired. Please sign in again.");
      }
      throw retryCause;
    }
  }
}

function fileForm(file: UploadFile): FormData {
  const form = new FormData();
  // React Native accepts { uri, name, type } here; the DOM types do not.
  form.append("file", file as unknown as Blob);
  return form;
}

async function binary(res: Response): Promise<BinaryBody> {
  return {
    bytes: await res.arrayBuffer(),
    mimeType: res.headers.get("Content-Type") ?? "application/octet-stream",
  };
}

export function signup(input: {
  name: string;
  email: string;
  password: string;
}) {
  return request<User>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function login(input: { email: string; password: string }) {
  return request<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function me(token?: string) {
  if (token) return request<User>("/auth/me", {}, token);
  return authorized<User>("/auth/me", {}, parseJson);
}

export function refresh(refreshToken: string) {
  return request<TokenResponse>("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

export function logout(refreshToken: string) {
  return requestVoid("/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

export function uploadImage(file: UploadFile) {
  return authorized<ImageInfo>(
    "/images",
    { method: "POST", body: fileForm(file) },
    parseJson,
  );
}

export function getImage(id: string) {
  return authorized<BinaryBody>(
    `/images/${encodeURIComponent(id)}`,
    {},
    binary,
  );
}

export function ask(imageId: string, question: string) {
  return authorized<AskResponse>(
    "/ask",
    {
      method: "POST",
      body: JSON.stringify({ image_id: imageId, question }),
    },
    parseJson,
  );
}

export function transcribe(file: UploadFile) {
  return authorized<Transcript>(
    "/stt",
    { method: "POST", body: fileForm(file) },
    parseJson,
  );
}

export function synthesize(text: string, language?: string, voice?: string) {
  const body: { text: string; language?: string; voice?: string } = { text };
  if (language) body.language = language;
  if (voice) body.voice = voice;
  return authorized<BinaryBody>(
    "/tts",
    { method: "POST", body: JSON.stringify(body) },
    binary,
  );
}

export function listHistory(options: { cursor?: string; limit?: number } = {}) {
  const query: string[] = [];
  if (options.cursor) {
    query.push(`cursor=${encodeURIComponent(options.cursor)}`);
  }
  if (options.limit) query.push(`limit=${options.limit}`);
  const suffix = query.length > 0 ? `?${query.join("&")}` : "";
  return authorized<HistoryPage>(`/history${suffix}`, {}, parseJson);
}

export function getHistoryEntry(id: string) {
  return authorized<HistoryItem>(
    `/history/${encodeURIComponent(id)}`,
    {},
    parseJson,
  );
}

export function deleteHistoryEntry(id: string) {
  return authorized<void>(
    `/history/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    parseJson,
  );
}

export function deleteAllHistory() {
  return authorized<void>("/history", { method: "DELETE" }, parseJson);
}

export function deleteImage(id: string) {
  return authorized<void>(
    `/images/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    parseJson,
  );
}
