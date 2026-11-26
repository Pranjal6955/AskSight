import { Platform } from "react-native";

const DEFAULT_API_URL =
  Platform.OS === "android" ? "http://10.0.2.2:8000" : "http://localhost:8000";

export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL
).replace(/\/$/, "");

export type User = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

export type Tokens = {
  access_token: string;
  refresh_token: string;
  token_type: string;
};

type ValidationIssue = {
  loc?: (string | number)[];
  msg?: string;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function validationMessage(issue: ValidationIssue | null): string {
  const field = issue?.loc?.[issue.loc.length - 1];

  if (field === "name") return "Please enter your name.";
  if (field === "email" || /email/i.test(issue?.msg ?? "")) {
    return "Please enter a valid email address.";
  }
  if (field === "password" || /password/i.test(issue?.msg ?? "")) {
    return "Please choose a password with at least 8 characters.";
  }
  return "Please check the information you entered and try again.";
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      detail?: string | ValidationIssue[];
    };

    if (typeof body.detail === "string") return body.detail;

    if (Array.isArray(body.detail)) {
      const messages = [...new Set(body.detail.map(validationMessage))];
      if (messages.length > 0) return messages.join(" ");
    }
  } catch {
    // The error body was not JSON; fall through to a status-based message.
  }

  if (response.status === 401) return "Invalid email or password.";
  if (response.status === 409) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (response.status === 429) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (response.status >= 500) {
    return "AskSight is having trouble right now. Please try again in a moment.";
  }
  return "We couldn't complete that request. Please try again.";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  const isFormData =
    typeof FormData !== "undefined" && init.body instanceof FormData;

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(init.body && !isFormData
          ? { "Content-Type": "application/json" }
          : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(
      "We couldn't connect to AskSight. Check your connection and try again.",
      0,
    );
  }

  if (!response.ok) {
    throw new ApiError(await readError(response), response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

export type UploadedImage = {
  id: string;
  mime_type: string;
  size_bytes: number;
  width: number;
  height: number;
  created_at: string;
};

export type AskResult = {
  entry_id: string;
  answer: string;
  model_version: string;
  created_at: string;
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

async function formFile(
  uri: string,
  name: string,
  type: string,
): Promise<Blob | { uri: string; name: string; type: string }> {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    return response.blob();
  }
  return { uri, name, type };
}

export async function uploadImage(
  accessToken: string,
  input: { uri: string; name: string; type: string },
): Promise<UploadedImage> {
  const body = new FormData();
  const file = await formFile(input.uri, input.name, input.type);
  if (file instanceof Blob) {
    body.append("file", file, input.name);
  } else {
    body.append("file", file as unknown as Blob);
  }
  return request<UploadedImage>("/images", {
    method: "POST",
    body,
    headers: authHeaders(accessToken),
  });
}

export function ask(
  accessToken: string,
  input: { image_id: string; question: string },
): Promise<AskResult> {
  return request<AskResult>("/ask", {
    method: "POST",
    body: JSON.stringify(input),
    headers: authHeaders(accessToken),
  });
}

export function deleteImage(accessToken: string, imageId: string): Promise<void> {
  return request(`/images/${encodeURIComponent(imageId)}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}

export async function synthesizeSpeech(
  accessToken: string,
  text: string,
): Promise<ArrayBuffer> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(accessToken),
      },
      body: JSON.stringify({ text, language: "en-IN" }),
    });
  } catch {
    throw new ApiError(
      "We couldn't connect to AskSight. Check your connection and try again.",
      0,
    );
  }

  if (!response.ok) {
    throw new ApiError(await readError(response), response.status);
  }
  return response.arrayBuffer();
}

export async function transcribeAudio(
  accessToken: string,
  input: { uri: string; name: string; type: string },
): Promise<{ transcript: string; language: string | null }> {
  const body = new FormData();
  const file = await formFile(input.uri, input.name, input.type);
  if (file instanceof Blob) {
    body.append("file", file, input.name);
  } else {
    body.append("file", file as unknown as Blob);
  }
  return request<{ transcript: string; language: string | null }>("/stt", {
    method: "POST",
    body,
    headers: authHeaders(accessToken),
  });
}

export function history(
  accessToken: string,
  limit = 20,
  cursor?: string | null,
): Promise<HistoryPage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  return request(`/history?${params.toString()}`, {
    headers: authHeaders(accessToken),
  });
}

export function signup(input: {
  name: string;
  email: string;
  password: string;
}): Promise<User> {
  return request<User>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function login(input: {
  email: string;
  password: string;
}): Promise<Tokens> {
  return request<Tokens>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function refresh(refreshToken: string): Promise<Tokens> {
  return request<Tokens>("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

export function me(accessToken: string): Promise<User> {
  return request<User>("/auth/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function logout(refreshToken: string): Promise<void> {
  return request<void>("/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}
